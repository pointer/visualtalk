/**
 * WKWebView on macOS sometimes decodes camera/WebRTC frames perfectly
 * (readyState 4, currentTime advancing, drawImage() returns real pixels) but
 * never composites the native <video> layer on screen — the tile stays black.
 * Mirroring frames into a <canvas> uses the regular paint path, which renders
 * reliably. Enabled only for Tauri desktop on macOS; iOS/Android/browser keep
 * the native (and cheaper) <video> path.
 */
export const IS_WKWEBVIEW_MAC =
  typeof window !== "undefined"
  && typeof navigator !== "undefined"
  && !!window.__TAURI_INTERNALS__
  && /Mac OS X|Macintosh/.test(navigator.userAgent)
  && !/iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * Continuously draws `video` frames into `canvas` (cover by default,
 * `contain` for screen shares, optional horizontal mirror for selfies).
 * Returns a stop function. Prefers requestVideoFrameCallback so we only
 * repaint when a new frame actually arrives.
 */
export function startCanvasVideo(video, canvas, { mirror = false, contain = false } = {}) {
  if (!video || !canvas) return () => {};
  let stopped = false;
  let rafId = 0;
  let vfcId = 0;

  const draw = () => {
    if (stopped) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw > 0 && vh > 0 && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const scale = contain
          ? Math.min(cw / vw, ch / vh)
          : Math.max(cw / vw, ch / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;
        ctx.clearRect(0, 0, cw, ch);
        ctx.save();
        if (mirror) {
          ctx.translate(cw, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, dx, dy, dw, dh);
        ctx.restore();
      }
    }
    schedule();
  };

  const schedule = () => {
    if (stopped) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      vfcId = video.requestVideoFrameCallback(() => draw());
    } else {
      rafId = requestAnimationFrame(() => draw());
    }
  };

  schedule();

  return () => {
    stopped = true;
    if (vfcId && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(vfcId);
      vfcId = 0;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}
