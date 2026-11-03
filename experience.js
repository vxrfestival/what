const configureEstimatedLighting = () => {
  if (!window.XR8 || window.__estimatedLightingConfigured) return
  XR8.XrController.configure({
    enableLighting: true,
    disableWorldTracking: false,
  })
  window.__estimatedLightingConfigured = true
}

if (window.XR8) configureEstimatedLighting()
else window.addEventListener('xrloaded', configureEstimatedLighting, {once: true})

const estimatedLightingPipelineModule = {
  name: 'estimated-lighting',
  onUpdate: ({processCpuResult}) => {
    const estimate = processCpuResult?.reality?.lighting
    if (estimate) {
      window.__estimatedLighting = estimate
      window.__estimatedLightingRevision = (window.__estimatedLightingRevision || 0) + 1
    }
  },
}

AFRAME.registerComponent('scene-lighting', {
  init() {
    this.baseLighting = {
      exposure: 1.22,
      key: 1.35,
      ambient: 0.72,
      hemi: 1.15,
      shadow: 0.72,
      environment: 1.9,
    }
    this.adaptiveLighting = {...this.baseLighting}
    this.lightingBaseline = null
    this.lastEstimateRevision = -1
    this.renderer = null

    if (!window.__estimatedLightingModuleAdded) {
      XR8.addCameraPipelineModule(estimatedLightingPipelineModule)
      window.__estimatedLightingModuleAdded = true
    }
    if (!window.__cleanScreenshotModuleAdded) {
      XR8.addCameraPipelineModule(XR8.canvasScreenshot().cameraPipelineModule())
      window.__cleanScreenshotModuleAdded = true
    }
    this.el.addEventListener('renderstart', () => {
      const renderer = this.el.renderer
      this.renderer = renderer
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.VSMShadowMap
      renderer.toneMappingExposure = 1.22
      this.addSoftEnvironment(renderer)
    })
  },

  scalarFrom(value) {
    if (Number.isFinite(value)) return Math.max(0.0001, value)
    if (!value || typeof value !== 'object') return null
    const channels = ['x', 'y', 'z'].map((key) => value[key]).filter(Number.isFinite)
    if (!channels.length) {
      channels.push(...['r', 'g', 'b'].map((key) => value[key]).filter(Number.isFinite))
    }
    if (!channels.length) return null
    return Math.max(0.0001, channels.reduce((sum, channel) => sum + channel, 0) / channels.length)
  },

  readLightingScalar(estimate) {
    if (!estimate || typeof estimate !== 'object') return null
    const candidates = [
      estimate.intensity,
      estimate.brightness,
      estimate.exposure,
      estimate.luminosity,
      estimate.ambientIntensity,
      estimate.primaryLightIntensity,
      estimate.mainLightIntensity,
      estimate.ambientLight,
      estimate.primaryLightColor,
    ]
    for (const candidate of candidates) {
      const scalar = this.scalarFrom(candidate)
      if (scalar !== null) return scalar
    }
    return null
  },

  tick() {
    if (!this.renderer) return
    const estimate = window.__estimatedLighting
    const scalar = this.readLightingScalar(estimate)
    const revision = window.__estimatedLightingRevision || 0
    if (scalar !== null && revision !== this.lastEstimateRevision) {
      this.lastEstimateRevision = revision
      if (this.lightingBaseline === null) this.lightingBaseline = scalar
      // Let the baseline follow very slowly so a long session remains stable,
      // while short transitions between dark and bright spaces are preserved.
      this.lightingBaseline = THREE.MathUtils.lerp(this.lightingBaseline, scalar, 0.002)
      const ratio = THREE.MathUtils.clamp(scalar / this.lightingBaseline, 0.62, 1.58)
      this.targets = {
        exposure: THREE.MathUtils.clamp(1.22 * Math.pow(ratio, 0.22), 1.02, 1.38),
        key: THREE.MathUtils.clamp(1.35 * Math.pow(ratio, 0.42), 0.88, 1.78),
        ambient: THREE.MathUtils.clamp(0.72 * Math.pow(ratio, 0.28), 0.55, 0.91),
        hemi: THREE.MathUtils.clamp(1.15 * Math.pow(ratio, 0.25), 0.90, 1.39),
        shadow: THREE.MathUtils.clamp(0.72 * Math.pow(ratio, 0.10), 0.66, 0.77),
        environment: THREE.MathUtils.clamp(1.9 * Math.pow(ratio, 0.20), 1.58, 2.18),
      }
    }

    const targets = this.targets || this.baseLighting
    Object.keys(this.adaptiveLighting).forEach((key) => {
      this.adaptiveLighting[key] = THREE.MathUtils.lerp(this.adaptiveLighting[key], targets[key], 0.025)
    })

    this.renderer.toneMappingExposure = this.adaptiveLighting.exposure
    const key = document.getElementById('keyLight')?.getObject3D('light')
    const ambient = document.getElementById('ambientLight')?.getObject3D('light')
    const hemi = document.getElementById('hemiLight')?.getObject3D('light')
    const groundMaterial = document.getElementById('ground')?.getObject3D('mesh')?.material
    if (key) key.intensity = this.adaptiveLighting.key
    if (ambient) ambient.intensity = this.adaptiveLighting.ambient
    if (hemi) hemi.intensity = this.adaptiveLighting.hemi
    if (groundMaterial) groundMaterial.opacity = this.adaptiveLighting.shadow
    window.__adaptiveFlowerEnvironmentIntensity = this.adaptiveLighting.environment
    if (window.__adaptiveFlowerMaterials) {
      window.__adaptiveFlowerMaterials.forEach((material) => {
        material.envMapIntensity = this.adaptiveLighting.environment
      })
    }
  },

  addSoftEnvironment(renderer) {
    const makeFace = (dark, light, offset = 0.5) => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const context = canvas.getContext('2d')
      const gradient = context.createLinearGradient(0, 0, 256, 0)
      gradient.addColorStop(0, dark)
      gradient.addColorStop(Math.max(0, offset - 0.16), dark)
      gradient.addColorStop(Math.max(0, offset - 0.045), light)
      gradient.addColorStop(Math.min(1, offset + 0.045), light)
      gradient.addColorStop(Math.min(1, offset + 0.18), dark)
      gradient.addColorStop(1, dark)
      context.fillStyle = gradient
      context.fillRect(0, 0, 256, 256)
      return canvas
    }
    const cube = new THREE.CubeTexture([
      makeFace('#252932', '#fff4ed', 0.36),
      makeFace('#202731', '#e8f5ff', 0.66),
      makeFace('#424149', '#ffffff', 0.5),
      makeFace('#1b1e25', '#8f929a', 0.42),
      makeFace('#28262c', '#ffece2', 0.7),
      makeFace('#202832', '#e5f2ff', 0.3),
    ])
    if ('colorSpace' in cube && THREE.SRGBColorSpace) cube.colorSpace = THREE.SRGBColorSpace
    cube.needsUpdate = true
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileCubemapShader()
    window.__flowerEnvironmentTexture = pmrem.fromCubemap(cube).texture
    cube.dispose()
    pmrem.dispose()
  },
})

AFRAME.registerComponent('soft-shadow-light', {
  init() {
    const apply = () => {
      const light = this.el.getObject3D('light')
      if (!light || !light.shadow) return
      light.shadow.radius = 30
      light.shadow.blurSamples = 32
      light.shadow.bias = -0.00025
      light.shadow.normalBias = 0.025
    }
    this.el.addEventListener('object3dset', apply)
    apply()
  },
})

AFRAME.registerComponent('seamless-animation', {
  init() {
    this.mixer = null
    this.action = null
    this.elapsed = 0
    this.loopDuration = 0
    this.el.addEventListener('model-loaded', (event) => {
      const model = event.detail.model
      model.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true
          node.receiveShadow = false
        }
      })
      if (!model.animations || !model.animations.length) return
      this.mixer = new THREE.AnimationMixer(model)
      const clip = model.animations[0]
      this.loopDuration = Math.max(0.1, clip.duration - (1 / 24))
      this.action = this.mixer.clipAction(clip)
      this.action.setLoop(THREE.LoopRepeat, Infinity)
      this.action.play()
      this.mixer.setTime(0)
    })
  },
  tick(_time, delta) {
    if (!this.mixer || !this.action || !this.loopDuration) return
    this.elapsed = (this.elapsed + delta / 1000) % this.loopDuration
    this.mixer.setTime(this.elapsed)
  },
})

AFRAME.registerComponent('flower-animation', {
  init() {
    this.mixer = null
    this.materials = []
    this.elapsed = 0
    this.duration = 10.4
    this.el.addEventListener('model-loaded', (event) => {
      const model = event.detail.model
      // Keep the model's exported glTF orientation. Its surface is already
      // parallel to WebGL's XZ ground plane.
      model.traverse((node) => {
        if (node.isMesh) {
          node.frustumCulled = false
          node.castShadow = true
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          materials.filter(Boolean).forEach((material) => {
            if ('roughness' in material) material.roughness = 0.34
            if ('metalness' in material) material.metalness = 0
            if ('envMapIntensity' in material) material.envMapIntensity = 1.9
            if (!window.__adaptiveFlowerMaterials) window.__adaptiveFlowerMaterials = new Set()
            window.__adaptiveFlowerMaterials.add(material)
            this.materials.push(material)
            if (window.__flowerEnvironmentTexture) material.envMap = window.__flowerEnvironmentTexture
            this.addMetallicMask(material)
            material.needsUpdate = true
          })
        }
      })

      // The mobile GLB is pre-centred and measures 28 cm, so no runtime
      // compensation or inverse scaling is required.
      model.position.set(0, 0, 0)
      this.el.object3D.userData.flowerScale = 1

      if (!model.animations?.length) return
      this.mixer = new THREE.AnimationMixer(model)
      const clip = model.animations[0]
      this.duration = Math.max(clip.duration, 0.1)
      const action = this.mixer.clipAction(clip)
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.play()
    })
  },

  addMetallicMask(material) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFlowerLocalPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlowerLocalPosition = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vFlowerLocalPosition;'
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb = min(vec3(1.0), pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.95)) * 1.025);
          float flowerLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float flowerMetalMask = 1.0 - smoothstep(0.035, 0.115, flowerLuma);
          vec3 flowerWarmPink = min(vec3(1.0), diffuseColor.rgb * vec3(1.08, 1.025, 0.90) + vec3(0.045, 0.025, 0.012));
          vec3 flowerSilver = vec3(0.72, 0.76, 0.82);
          diffuseColor.rgb = mix(flowerWarmPink, flowerSilver, flowerMetalMask);`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.008, flowerMetalMask);'
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, flowerMetalMask);'
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float flowerRippleX = sin(vFlowerLocalPosition.x * 115.0 + sin(vFlowerLocalPosition.z * 63.0) * 1.8);
          float flowerRippleY = sin(vFlowerLocalPosition.z * 135.0 + sin(vFlowerLocalPosition.x * 81.0) * 1.4);
          normal = normalize(normal + vec3(flowerRippleX, flowerRippleY, 0.0) * flowerMetalMask * 0.015);`
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          float flowerGlossA = pow(max(dot(normal, normalize(vec3(-0.42, 0.56, 0.72))), 0.0), 120.0) * 2.5;
          float flowerGlossB = pow(max(dot(normal, normalize(vec3(0.55, 0.30, 0.78))), 0.0), 58.0) * 0.7;
          float flowerGloss = flowerGlossA + flowerGlossB;
          reflectedLight.directSpecular += vec3(1.0, 0.97, 0.95) * flowerGloss * (0.16 + flowerMetalMask * 1.2);`
        )
    }
    material.customProgramCacheKey = () => 'flower-bake-metal-mask-v8'
  },

  tick(_time, delta) {
    if (!this.mixer) return
    const step = Math.min(delta / 1000, 0.05)
    this.elapsed = (this.elapsed + step) % this.duration
    this.mixer.update(step)
  },

  remove() {
    if (!window.__adaptiveFlowerMaterials) return
    this.materials.forEach((material) => window.__adaptiveFlowerMaterials.delete(material))
  },
})

AFRAME.registerComponent('creature-placement', {
  init() {
    const ground = document.getElementById('ground')
    const creature = document.getElementById('creature')
    const cursor = document.getElementById('placementCursor')
    const captureButton = document.getElementById('capture-button')
    let model = null
    let pendingGroundY = null
    window.__creatureGroundY = null

    const alignToGround = (groundY) => {
      if (!model) return
      model.traverse((node) => {
        if (node.isSkinnedMesh && node.computeBoundingBox) node.computeBoundingBox()
      })
      creature.object3D.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(model)
      if (!Number.isFinite(bounds.min.y)) return
      creature.object3D.position.y += groundY - bounds.min.y - 0.07
      creature.object3D.updateMatrixWorld(true)
      pendingGroundY = null
    }

    creature.addEventListener('model-loaded', (event) => {
      model = event.detail.model
      if (pendingGroundY !== null) alignToGround(pendingGroundY)
    })
    ground.addEventListener('mousemove', (event) => {
      if (!event.detail.intersection) return
      cursor.object3D.position.copy(event.detail.intersection.point)
      cursor.object3D.position.y += 0.012
    })
    ground.addEventListener('click', (event) => {
      if (!event.detail.intersection) return
      const point = event.detail.intersection.point
      creature.object3D.position.copy(point)
      creature.setAttribute('visible', true)
      pendingGroundY = point.y
      window.__creatureGroundY = point.y
      if (model) alignToGround(point.y)
      cursor.setAttribute('visible', false)
    })
    captureButton.addEventListener('click', () => captureCanvas())
  },
})

AFRAME.registerComponent('ground-flower', {
  schema: {
    finalScale: {default: 1},
    lifetime: {default: 9000},
    yaw: {default: 0},
  },
  init() {
    this.age = 0
    // glTF converts Blender's Z-up coordinates to WebGL's Y-up coordinates.
    // The flower already arrives parallel to the ground; only randomise yaw.
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(this.data.yaw)
    )
    this.el.object3D.quaternion.copy(yaw)
    this.el.object3D.scale.setScalar(0.001)
  },
  tick(_time, delta) {
    this.age += delta
    const grow = Math.min(1, this.age / 850)
    const growEased = grow * grow * (3 - 2 * grow)
    const fadeStart = this.data.lifetime - 1300
    const shrink = this.age > fadeStart ? Math.max(0, 1 - (this.age - fadeStart) / 1300) : 1
    const shrinkEased = shrink * shrink * (3 - 2 * shrink)
    this.el.object3D.scale.setScalar(Math.max(0.001, growEased * shrinkEased * this.data.finalScale))
    if (this.age >= this.data.lifetime) this.el.parentNode?.removeChild(this.el)
  },
})

AFRAME.registerComponent('hand-flower', {
  init() {
    this.camera = document.getElementById('camera')
    this.landmarker = null
    this.lastDetection = 0
    this.lastSpawn = 0
    this.busy = false
    this.flatWorldQuaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0)
    )
    this.handSamples = []
    this.missedFrames = 0
    this.raycaster = new THREE.Raycaster()
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this.groundPoint = new THREE.Vector3()
    this.smoothedPoint = new THREE.Vector3()
    this.hasGroundPoint = false
    this.lastFlowerPoint = new THREE.Vector3()
    this.flowers = []
    this.ready = false

    this.el.addEventListener('renderstart', () => {
      this.loadHandTracking()
    })
  },

  async loadHandTracking() {
    try {
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm')
      const fileset = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      )
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      this.ready = true
    } catch (error) {
      console.warn('Hand tracking could not start', error)
    }
  },

  tick(time) {
    if (!this.ready || this.busy || time - this.lastDetection < 100) return
    const canvas = this.el.canvas
    if (!canvas?.width || !canvas?.height) return
    this.lastDetection = time
    this.busy = true
    try {
      const result = this.landmarker.detectForVideo(canvas, performance.now())
      this.updateHand(result.landmarks?.[0], time)
    } catch (error) {
      console.warn('Hand detection frame skipped', error)
    } finally {
      this.busy = false
    }
  },

  updateHand(hand, time) {
    if (!hand) {
      this.missedFrames += 1
      if (this.missedFrames > 3) {
        this.handSamples.length = 0
        this.hasGroundPoint = false
      }
      return
    }
    this.missedFrames = 0
    const palmIds = [0, 5, 9, 13, 17]
    const palm = palmIds.reduce((sum, id) => {
      sum.x += hand[id].x
      sum.y += hand[id].y
      return sum
    }, {x: 0, y: 0})
    palm.x /= palmIds.length
    palm.y /= palmIds.length

    const measuredSpan = Math.hypot(hand[5].x - hand[17].x, hand[5].y - hand[17].y)
    this.handSamples.push({x: palm.x, y: palm.y, span: measuredSpan})
    if (this.handSamples.length > 5) this.handSamples.shift()
    if (this.handSamples.length < 3 || window.__creatureGroundY === null) return

    const median = (key) => {
      const values = this.handSamples.map((sample) => sample[key]).sort((a, b) => a - b)
      return values[Math.floor(values.length / 2)]
    }
    palm.x = median('x')
    palm.y = median('y')
    const camera = this.camera.getObject3D('camera')
    this.raycaster.setFromCamera({x: palm.x * 2 - 1, y: 1 - palm.y * 2}, camera)
    this.groundPlane.constant = -window.__creatureGroundY
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.groundPoint)) return

    if (this.hasGroundPoint) {
      this.smoothedPoint.lerp(this.groundPoint, 0.22)
    } else {
      this.smoothedPoint.copy(this.groundPoint)
      this.hasGroundPoint = true
    }

    if (time - this.lastSpawn > 270) this.spawnFlower(this.smoothedPoint, time)
  },

  spawnFlower(point, time) {
    this.flowers = this.flowers.filter((item) => item.isConnected)
    if (this.flowers.length >= 28) {
      this.lastSpawn = time
      return
    }
    const flowerRoot = document.createElement('a-entity')
    const flowerModel = document.createElement('a-entity')
    const scale = 1.22 + Math.random() * 0.7
    const angle = Math.random() * Math.PI * 2
    const radius = 0.04 + Math.random() * 0.14
    flowerRoot.setAttribute(
      'ground-flower',
      `finalScale: ${scale}; lifetime: ${16400 + Math.random() * 4400}; yaw: ${Math.random() * 360}`
    )
    flowerModel.setAttribute('gltf-model', '#flowerModel')
    flowerModel.setAttribute('flower-animation', '')
    flowerModel.setAttribute('shadow', 'cast: true; receive: false')
    flowerRoot.appendChild(flowerModel)
    flowerRoot.object3D.position.copy(point)
    flowerRoot.object3D.position.x += Math.cos(angle) * radius
    flowerRoot.object3D.position.z += Math.sin(angle) * radius
    flowerRoot.object3D.position.y += 0.006
    this.el.appendChild(flowerRoot)

    this.flowers.push(flowerRoot)
    this.lastFlowerPoint.copy(point)
    this.lastSpawn = time
  },
})

async function captureCanvas() {
  if (!XR8?.canvasScreenshot) return
  const base64 = await XR8.canvasScreenshot().takeScreenshot()
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const file = new File([bytes], 'aquello-que-vi.jpg', {type: 'image/jpeg'})
  try {
    if (navigator.canShare?.({files: [file]})) {
      await navigator.share({files: [file]})
      return
    }
  } catch (error) {
    if (error.name === 'AbortError') return
  }
  const link = document.createElement('a')
  link.href = `data:image/jpeg;base64,${base64}`
  link.download = file.name
  link.click()
}

window.addEventListener('DOMContentLoaded', () => {
  const card = document.getElementById('instruction-card')
  const close = document.getElementById('instruction-close')
  let timer = null
  const dismiss = (event) => {
    event?.preventDefault()
    event?.stopPropagation()
    if (!card || card.classList.contains('is-hiding')) return
    clearTimeout(timer)
    card.classList.add('is-hiding')
    setTimeout(() => card.remove(), 500)
  }
  close?.addEventListener('pointerdown', (event) => event.stopPropagation())
  close?.addEventListener('click', dismiss)
  timer = setTimeout(dismiss, 7500)
})
