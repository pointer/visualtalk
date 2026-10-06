import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { describeMediaError } from "../components/Permissions";

/**
 * Composable for media device enumeration.
 *
 * Enumerates through the browser API (the only source WKWebView exposes),
 * syncs the result into the Rust `DeviceManager` via `set_devices` so the
 * `get_video_inputs` / `get_preferred_*` commands return real data, and
 * refreshes automatically when devices are plugged/unplugged.
 */
export function useMediaDevices() {
  const [devices, setDevices] = createSignal({ audio: [], video: [], audioOutput: [] });
  const [selectedMic, setSelectedMic] = createSignal("");
  const [selectedCam, setSelectedCam] = createSignal("");
  const [deviceError, setDeviceError] = createSignal("");

  let changeHandler = null;

  // Best-effort sync into the Rust DeviceManager (SettingsTab reads from it).
  const syncToRust = async (allDevices) => {
    try {
      await invoke("set_devices", {
        devices: allDevices
          .filter((d) => ["audioinput", "audiooutput", "videoinput"].includes(d.kind))
          .map((d) => ({
            id: d.deviceId,
            label: d.label || `${d.kind} (${(d.deviceId || "").slice(0, 6)})`,
            kind: d.kind,
            group_id: d.groupId || null,
          })),
      });
    } catch (err) {
      console.warn("[useMediaDevices] Rust device sync failed:", err);
    }
  };

  const loadDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setDeviceError("navigator.mediaDevices is unavailable in this webview (insecure context?).");
        return;
      }

      let allDevices = await navigator.mediaDevices.enumerateDevices();

      // WKWebView (macOS/iOS) hides device IDs and labels until permission is
      // granted. Trigger the permission prompt once, then re-enumerate.
      const hasRealInfo = allDevices.some(
        (d) => (d.kind === "videoinput" || d.kind === "audioinput") && d.deviceId
      );
      if (!hasRealInfo || allDevices.every((d) => !d.label)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // A camera-only or mic-only machine may still enumerate partially.
          try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach((t) => t.stop());
          } catch { /* ignore */ }
          try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true });
            s.getTracks().forEach((t) => t.stop());
          } catch (err2) {
            setDeviceError(describeMediaError(err2));
          }
        }
        allDevices = await navigator.mediaDevices.enumerateDevices();
      }

      const audioInputs = allDevices.filter((d) => d.kind === "audioinput");
      const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
      const audioOutputs = allDevices.filter((d) => d.kind === "audiooutput");
      setDevices({ audio: audioInputs, video: videoInputs, audioOutput: audioOutputs });

      // Keep the selection valid; reset it when the device disappeared.
      if (audioInputs.length) {
        if (!audioInputs.some((d) => d.deviceId === selectedMic())) {
          setSelectedMic(audioInputs[0].deviceId);
        }
      } else {
        setSelectedMic("");
      }
      if (videoInputs.length) {
        if (!videoInputs.some((d) => d.deviceId === selectedCam())) {
          setSelectedCam(videoInputs[0].deviceId);
        }
      } else {
        setSelectedCam("");
      }

      if (videoInputs.length || audioInputs.length) setDeviceError("");

      // Keep the Rust DeviceManager in sync for SettingsTab / preferred devices.
      await syncToRust(allDevices);

      // Refresh automatically when devices are plugged/unplugged.
      watchDevices();
    } catch (err) {
      console.error("Error enumerating devices:", err);
      setDeviceError(describeMediaError(err));
    }
  };

  const watchDevices = () => {
    if (changeHandler || !navigator.mediaDevices?.addEventListener) return;
    changeHandler = () => { loadDevices(); };
    navigator.mediaDevices.addEventListener("devicechange", changeHandler);
  };

  const stopWatching = () => {
    if (changeHandler && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener("devicechange", changeHandler);
      changeHandler = null;
    }
  };

  return {
    devices,
    deviceError,
    selectedMic,
    setSelectedMic,
    selectedCam,
    setSelectedCam,
    loadDevices,
    watchDevices,
    stopWatching,
  };
}
