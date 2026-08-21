# macOS Tauri Camera Permission Checklist (LiveKit / WebRTC)

A complete, order-critical checklist for granting camera access to the **webview** of a
Tauri v2 macOS app so that a LiveKit integration (or any `navigator.mediaDevices.getUserMedia()`
/ WebRTC call) can obtain a video `MediaStream` at runtime.

It also documents how to build a **native AVFoundation diagnostic command** that tells you,
from the Rust side, whether the OS actually lets your process see a camera — independent of the
WebView/LiveKit stack — so you can isolate **sandbox/TCC policy denial** from **missing hardware
enumeration inside the Tauri runtime**.

---

## 0. The mental model (read this first)

Camera access for LiveKit in a Tauri webview is governed by **four independent layers**. Every
layer must pass, and a failure at layer 3 or 4 silently produces `NotAllowedError` /
`navigator.mediaDevices is undefined` in the webview — with **no** Rust-side error.

| # | Layer | Controlled by | What breaks if missing |
|---|-------|---------------|------------------------|
| 1 | Privacy usage string | `Info.plist` (`NSCameraUsageDescription`) | `getUserMedia` throws / no prompt; app can be **killed** by the OS |
| 2 | Sandbox capability | `Entitlements.plist` (`com.apple.security.device.camera`) | `navigator.mediaDevices` is `undefined`; no TCC prompt ever appears |
| 3 | WebView media-capture decision | wry → `WKUIDelegate` (`requestMediaCapturePermissionFor…`) | Permission silently denied at the webview level (esp. macOS 14 Sonoma) |
| 4 | Runtime TCC authorization | System Settings → Privacy & Security → Camera | Status stays `denied`; devices enumerate as empty |

> **Critical Tauri fact:** the Tauri v2 **capabilities/permissions system gates Tauri commands and
> plugins** exposed to the frontend — it does **not** grant WebRTC/`getUserMedia` camera hardware
> access to the webview. There is **no** `camera` capability identifier that opens the camera for
> LiveKit. The camera gate is entirely Apple's (layers 1, 2, 4) plus wry's delegate (layer 3)
> ([Tauri Permissions](https://v2.tauri.app/security/permissions/), [Tauri Capabilities](https://v2.tauri.app/security/capabilities/)).
> Tauri capabilities are only needed to expose your **diagnostic command** to the frontend.

---

## 1. `Info.plist` — privacy usage strings (layer 1)

Tauri **auto-merges** `src-tauri/Info.plist` into the generated bundle `Info.plist` (both in `tauri dev`
and `tauri build`). Put the file at `src-tauri/Info.plist` ([Tauri macOS application bundle](https://v2.tauri.app/distribute/macos-application-bundle/)).
As of Tauri CLI **2.9.0** you can also point to it via `bundle.macOS.infoPlist` ([Tauri config reference](https://v2.tauri.app/reference/config/)).

Required key:

| Key | Type | Required? | Notes |
|-----|------|-----------|-------|
| `NSCameraUsageDescription` | `String` | **Yes** (for video) | Plain-text reason shown in the TCC prompt. Absence can crash/kill the app when it requests camera access. ([Apple docs](https://developer.apple.com/documentation/bundleresources/information_property_list/nscamerausagedescription)) |

Conditional (LiveKit audio tracks):

| Key | Type | Required? | Notes |
|-----|------|-----------|-------|
| `NSMicrophoneUsageDescription` | `String` | If mic is used | Required for `getUserMedia({audio:true})` and LiveKit audio tracks. |

> Apple requires **both** the `NSCameraUsageDescription` text in `Info.plist` **and** the
> `com.apple.security.device.camera` entitlement for a legitimate camera request; one without the
> other is not enough ([Eclectic Light Co.](https://eclecticlight.co/2025/03/03/managing-privacy-protected-devices/)).

### `src-tauri/Info.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSCameraUsageDescription</key>
  <string>We use your camera for live video calls.</string>
  <!-- Required only if LiveKit also opens the microphone -->
  <key>NSMicrophoneUsageDescription</key>
  <string>We use your microphone for live audio in calls.</string>
</dict>
</plist>
```

**Pitfall:** Do **not** reuse `Info.plist` as your entitlements file. `bundle.macOS.entitlements`
must point to a **separate** `.entitlements`/`.plist` file — using `Info.plist` there causes
`codesign` to apply the wrong keys and breaks the app ([Tauri #9738](https://github.com/tauri-apps/tauri/issues/9738)).

---

## 2. Sandbox entitlements (layer 2)

Code-signing entitlements declare that your app is allowed to touch protected devices. They are
applied **only when the binary is signed**; declare them in `src-tauri/Entitlements.plist` and
reference it from `tauri.conf.json > bundle > macOS > entitlements` ([Tauri macOS bundle](https://v2.tauri.app/distribute/macos-application-bundle/),
[Tauri App Store](https://v2.tauri.app/distribute/app-store/)).

| Entitlement key | Value | Purpose |
|-----------------|-------|---------|
| `com.apple.security.device.camera` | `true` | Allows interacting with built-in/external cameras. **Required** for video. ([Apple docs](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.device.camera)) |
| `com.apple.security.device.audio-input` | `true` | Required only if mic is used. |
| `com.apple.security.app-sandbox` | `true` | **App Store only.** Required for Mac App Store; not needed for Developer-ID/notarized DMG. |
| `com.apple.security.network.client` | `true` | Outbound HTTPS — LiveKit signaling/media. Mandatory if `app-sandbox` is on. |
| `com.apple.security.cs.allow-jit` | `true` | WebView JIT; effectively required for WKWebView. |
| `com.apple.security.cs.allow-unsigned-executable-memory` | `true` | JS engine executable memory; usually paired with `allow-jit`. |

> Without `com.apple.security.device.camera` (and `app-sandbox` on, or hardened runtime),
> `navigator.mediaDevices` is literally `undefined` and no permission prompt ever appears
> ([WebKit bug 259465](https://bugs.webkit.org/show_bug.cgi?id=259465)).

### `src-tauri/Entitlements.plist` (non-App-Store / Developer-ID)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.device.camera</key>
  <true/>
  <!-- Only if LiveKit uses the microphone -->
  <key>com.apple.security.device.audio-input</key>
  <true/>
  <!-- WKWebView needs JIT; mandatory for the webview to function -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <!-- LiveKit needs outbound network -->
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
</plist>
```

For **Mac App Store** builds, add `<key>com.apple.security.app-sandbox</key><true/>` and your App
ID/Team ID per the [App Store guide](https://v2.tauri.app/distribute/app-store/).

### Verify the signed binary actually carries the entitlement

```bash
codesign -d --entitlements :- "target/release/bundle/macos/YourApp.app"
# Look for: com.apple.security.device.camera
```

---

## 3. `tauri.conf.json` — wiring it together

```jsonc
{
  "productName": "YourApp",
  "identifier": "com.example.yourapp",   // MUST match the signed bundle id / App ID
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "macOS": {
      "entitlements": "./Entitlements.plist",   // layer 2
      "infoPlist": "./Info.plist",              // layer 1 (CLI >= 2.9.0; otherwise auto-merged from src-tauri/Info.plist)
      "minimumSystemVersion": "12.0",            // WKWebView media-capture delegate needs macOS 12+
      "hardenedRuntime": true
    }
  },
  "app": {
    "security": {
      "capabilities": ["camera-diagnostic"]    // gates your diagnostic COMMAND only (see §5)
    }
  }
}
```

Notes:
- `identifier` (the bundle id) **must be consistent** across `tauri.conf.json`, the signing
  identity, and the App ID. TCC keys camera permission to the bundle id; a mismatch means the
  granted permission never applies to the binary you launch.
- `minimumSystemVersion: "12.0"` — the public `WKUIDelegate
  requestMediaCapturePermissionFor:initiatedByFrame:type:decisionHandler:` delegate exists on
  macOS 12+ ([Apple docs](https://developer.apple.com/documentation/webkit/wkuidelegate/webview(_:requestmediacapturepermissionfor:initiatedbyframe:type:decisionhandler:))).
  wry implements this delegate for Tauri v2 ([wry changelog](https://v2.tauri.app/release/wry/all-versions/)).

---

## 4. WebView media-capture permission (layer 3)

When the webview calls `getUserMedia({video:true})`, WebKit consults the `WKUIDelegate`. Tauri's
webview layer (**wry**) implements `requestMediaCapturePermissionFor…` and grants the request
provided layers 1+2 are satisfied and the user approves the TCC prompt.

Known pitfalls (all real, all fixed in current Tauri/wry — keep your versions current):

- **macOS 14 Sonoma double-prompt / silent deny.** On macOS 14.0, `getUserMedia` can prompt twice
  (app-level + webview-level), and if the second (webview) prompt is suppressed the request is
  silently denied. The fix is the wry delegate, which is present in current Tauri/wry
  ([wry #1195](https://github.com/tauri-apps/wry/issues/1195)).
- **objc2 debug-assertion panic at startup** on macOS 11 when the delegate is registered. Fix:
  keep `tauri >= 2.3` and `cargo update -p wry`, or add
  `[profile.dev.package.objc2] debug-assertions = false` ([Tauri #11496](https://github.com/tauri-apps/tauri/issues/11496)).
- **Dev builds.** `tauri dev` runs your terminal's binary; the camera entitlement/TCC may be
  granted to Terminal/VSCode, not your app. Grant camera to your terminal host, or test in a
  signed release build ([Tauri #10878](https://github.com/tauri-apps/tauri/issues/10878)).
- **Universal binaries** can trigger multiple prompts; prefer single-arch during debugging
  ([tauri-webrtc-permissions example](https://github.com/chrisflatley/tauri-webrtc-permissions)).

No Tauri capability JSON is needed for the webview's `getUserMedia` itself — that path is entirely
Apple + wry. The capability in §5 only gates your own diagnostic command.

---

## 5. Tauri capabilities — for your diagnostic command only

Tauri v2 capabilities live as JSON/TOML in `src-tauri/capabilities/` and reference
`<plugin>:<permission>` identifiers ([Tauri Capabilities](https://v2.tauri.app/security/capabilities/)).
The diagnostic command shipped in this toolkit is `diagnose_camera`, exposed by the
`tauri-plugin-camera-diagnostic` plugin, so the capability grants:

### `src-tauri/capabilities/camera-diagnostic.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "camera-diagnostic",
  "description": "Allow the frontend to invoke the native AVFoundation camera diagnostic.",
  "windows": ["main"],
  "platforms": ["macOS"],
  "permissions": ["camera-diagnostic:allow-diagnose-camera"]
}
```

> This grants the **frontend** the right to call the `diagnose_camera` Tauri command. It does
> **not** open the camera for LiveKit — that is layers 1–4. See `plugin/` for the command source;
> the `camera-diagnostic:allow-diagnose-camera` permission is auto-generated by `plugin/build.rs`
> from the `COMMANDS` list, and `plugin/permissions/default.toml` includes it in the `[default]` set.

---

## 6. Runtime TCC authorization (layer 4) & reset

After layers 1–3 are correct, the user must grant camera in **System Settings → Privacy &
Security → Camera**. To reset TCC for a clean test:

```bash
# Reset camera TCC for your bundle id (then relaunch; re-approve the prompt)
tccutil reset Camera com.example.yourapp
```

Inspect live TCC decisions in **Console.app** (process `tccd`) while reproducing; look for your
bundle id and `Camera`.

---

## 7. The diagnostic tool — isolating the failure

The `tauri-plugin-camera-diagnostic` crate (in `plugin/`) exposes one command,
`diagnose_camera`, which uses AVFoundation directly via the `objc2-av-foundation` crate to report
the native ground truth ([docs.rs AVCaptureDevice](https://docs.rs/objc2-av-foundation/latest/objc2_av_foundation/struct.AVCaptureDevice.html)):

- `AVCaptureDevice::authorizationStatusForMediaType(AVMediaTypeVideo)` → the OS's denial indicator:
  `notDetermined (0)`, `restricted (1)`, `denied (2)`, `authorized (3)`.
- `AVCaptureDevice::devicesWithMediaType(AVMediaTypeVideo)` → enumerated video devices with
  `uniqueID`, `localizedName`, `manufacturer`, `position`, `deviceType`, `isConnected`,
  `isInUseByAnotherApplication`, `isSuspended`, `isVirtualDevice`.

### Decision matrix the command returns

| `authorization_status` | video devices | Verdict | Meaning / fix |
|------------------------|---------------|---------|----------------|
| `denied` / `restricted` | any | `denied_by_tcc` | **Sandbox/TCC policy restriction.** Reset TCC; verify entitlement + Info.plist; re-sign. |
| `notDetermined` | any | `not_determined` | Access never requested. Trigger `getUserMedia` in the webview or call `requestAccess`. |
| `authorized` | 0 | `no_video_devices_enumerated` | **Missing hardware enumeration / no camera present.** Check hardware; sandbox may be blocking enumeration. |
| `authorized` | ≥1, all suspended/in-use | `device_unavailable` | Hardware busy (another app holds the camera). |
| `authorized` | ≥1 connected | `ready` | A valid video capture source is detected — problem is downstream (LiveKit/WebKit/CSP), not OS policy. |

> Note on `AVVideoCaptureSource`: that is an **internal WebKit/LiveKit capture-source type**, not a
> public AVFoundation class. This tool verifies the precondition LiveKit's capture source needs —
> that AVFoundation can enumerate a usable `AVCaptureDevice` and that TCC/sandbox permit it. If this
> command returns `ready` but LiveKit still fails, the issue is in the webview/WebRTC layer (layer 3
> / CSP / WKWebView), not in OS camera policy.

### Frontend usage

```ts
import { invoke } from '@tauri-apps/api/core';
// Plugin commands are namespaced as `plugin:<plugin-name>|<command>`.
const report = await invoke('plugin:camera-diagnostic|diagnose_camera');
console.log(report.authorization_status, report.verdict, report.devices);
```

---

## 8. Final pre-flight checklist

- [ ] `src-tauri/Info.plist` contains `NSCameraUsageDescription` (+ `NSMicrophoneUsageDescription` if audio).
- [ ] `src-tauri/Entitlements.plist` contains `com.apple.security.device.camera` (+ `audio-input` if audio, + `network.client`, + JIT keys).
- [ ] `tauri.conf.json > bundle.macOS.entitlements` points at `Entitlements.plist` (not `Info.plist`).
- [ ] `tauri.conf.json > identifier` matches the signed bundle id / App ID.
- [ ] `minimumSystemVersion >= 12.0` (WKWebView media-capture delegate).
- [ ] `bundle.macOS.hardenedRuntime = true`; app is code-signed (entitlements apply only when signed).
- [ ] Tauri ≥ 2.3 / wry current (Sonoma fix + objc2 debug-assertion fix).
- [ ] `[profile.dev.package.objc2] debug-assertions = false` if you hit the startup panic.
- [ ] `capabilities/camera-diagnostic.json` grants `camera-diagnostic:allow-diagnose-camera`.
- [ ] `tccutil reset Camera <bundle-id>` before a clean test.
- [ ] Run a **signed release build** for final verification (dev builds attribute TCC to the terminal).
