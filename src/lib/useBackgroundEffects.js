import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/**
 * Composable for background effect state and CSS preview effects.
 * Manages background selection, panel visibility, and visual preview on the video element.
 */
export function useBackgroundEffects() {
  const [background, setBackground] = createSignal({
    enabled: false,
    kind: { type: "none" },
  });
  const [backgroundsOpen, setBackgroundsOpen] = createSignal(false);

  // ---- Load saved background from Rust and apply to preview element ----
  const loadSavedBackground = async (videoEl) => {
    try {
      const saved = await invoke("get_background");
      setBackground(saved);
      applyBackgroundEffect(saved, videoEl);
    } catch (error) {
      console.error("Could not load background settings:", error);
    }
  };

  // ---- Toggle the background selection panel ----
  const toggleBackgroundsPanel = () => {
    setBackgroundsOpen((prev) => !prev);
  };

  // ---- Select a new background, save via Rust, apply to preview ----
  const selectBackground = async (next, videoEl) => {
    try {
      const saved = await invoke("set_background", { settings: next });
      setBackground(saved);
      setBackgroundsOpen(false);
      applyBackgroundEffect(saved, videoEl);
    } catch (error) {
      console.error("Could not set background:", error);
    }
  };

  // ---- Apply a CSS-based preview effect to the video element ----
  // NOTE: This is a visual preview only. It does NOT modify the outgoing WebRTC stream.
  // A true virtual background requires WASM/MediaPipe processing (Phase 4).
  const applyBackgroundEffect = (settings, videoEl) => {
    if (!videoEl) return;

    const selected = settings?.kind?.type;

    if (!settings.enabled || selected === "none") {
      videoEl.style.filter = "";
      videoEl.style.backgroundColor = "";
      videoEl.style.backgroundImage = "";
      return;
    }

    if (selected === "blur") {
      videoEl.style.filter = "blur(8px)";
      videoEl.style.backgroundColor = "";
      videoEl.style.backgroundImage = "";
      return;
    }

    if (selected === "color") {
      videoEl.style.filter = "";
      videoEl.style.backgroundColor = settings.kind.value;
      videoEl.style.backgroundImage = "";
    }
  };

  return {
    background,
    backgroundsOpen,
    loadSavedBackground,
    toggleBackgroundsPanel,
    selectBackground,
    applyBackgroundEffect,
  };
}
