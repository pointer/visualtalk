/**
 * Runtime platform probes shared by the UI layer.
 *
 * Tauri exposes no `process.platform` inside the webview, and pulling in
 * @tauri-apps/plugin-os for a couple of booleans would cost an async IPC round
 * trip during render — so, as elsewhere in this codebase, we sniff the UA
 * synchronously. Keep this module the single source of truth for those sniffs.
 */

/** True inside the iOS (WKWebView) and Android (System WebView) shells. */
export const IS_MOBILE =
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod|Android/.test(navigator.userAgent);

/**
 * True when the webview can actually capture the screen.
 *
 * `getDisplayMedia` is not implemented by either mobile webview Tauri targets:
 * Android System WebView has no system capture-picker surface to grant, and
 * WKWebView never shipped it. LiveKit's `setScreenShareEnabled(true)` can
 * therefore only ever reject there, so screen sharing stays desktop-only and
 * the toolbar hides the button instead of showing one that always fails.
 */
export const SUPPORTS_SCREEN_SHARE = !IS_MOBILE;
