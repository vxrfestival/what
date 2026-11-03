AQUELLO QUE VI YA NO PUEDE TOCARSE — LOLA ZOIDO
WHAT I SAW CAN NO LONGER BE TOUCHED
WEBAR PACKAGE READY FOR STATIC HOSTING

FILES TO UPLOAD
---------------
Upload ALL the contents of this folder while preserving its exact structure:

  index.html
  experience.js
  styles.css
  assets/

The index.html file must be located at the root of the chosen public URL. The
experience may be hosted at the root of a domain or inside any subdirectory.
All internal paths are relative.

HOW THE EXPERIENCE WORKS
------------------------
The creature is placed on a detected floor and plays its animation. When the
system detects a visible hand, the hand projects temporary flowers onto that
same floor. The capture button saves a clean image without the interface.

HOSTING REQUIREMENTS
--------------------
1. The public URL must use HTTPS. Browsers block camera access over HTTP.
2. Standard static-file hosting is sufficient. No Node.js, PHP, database,
   build process, API key or environment variable is required.
3. Preserve all file names, including their letter case.
4. Allow browser connections to:
   - cdn.8thwall.com
   - cdn.jsdelivr.net
   - storage.googleapis.com
5. Serve .glb as model/gltf-binary or application/octet-stream and serve
   .js/.html/.css using their standard MIME types.

EXTERNAL DEPENDENCIES
---------------------
The WebAR engine, A-Frame and MediaPipe are loaded from public CDNs. Visitors
therefore need an internet connection. No platform account or key needs to be
configured on the hosting server.

IF EMBEDDED IN AN IFRAME
------------------------
Opening the experience directly is strongly recommended. If it must be placed
inside an iframe, the iframe needs at least:

  allow="camera; gyroscope; accelerometer; fullscreen"

The hosting domain must also allow camera access through its Permissions-Policy
HTTP header.

PRE-PUBLICATION TEST
--------------------
- Open the public URL directly in an up-to-date Safari browser on iPhone/iPad.
- Open it in an up-to-date Chrome browser on Android.
- Grant camera permission.
- Scan a well-lit floor with visible texture while moving the phone slowly.
- Place the creature and check scale, floor contact, shadow and animation.
- Show one hand and confirm that flowers appear on the floor.
- Test clean-image capture.
- Test using both Wi-Fi and mobile data.
- Do not use the in-app browsers of Instagram, TikTok or messaging apps. Use
  “Open in Safari” or “Open in Chrome”.

COMPATIBILITY
-------------
Designed for modern Safari on iOS/iPadOS and modern Chrome on Android, on
devices with a camera, WebGL support, motion sensors and enough performance for
world and hand tracking. Hand detection is more demanding than Portable Garden
and may run less frequently or be unavailable on older devices. Embedded
browsers and corporate policies may block camera or WebGL access.

UPDATES AND CACHING
-------------------
When replacing a version, upload all files together. If the host uses a CDN or
aggressive caching, invalidate the cache for index.html, experience.js,
styles.css and the models inside assets/.

