import { createSignal } from "solid-js";

/**
 * Composable for media device enumeration.
 * Manages the list of available audio/video inputs and the user's selection.
 */
export function useMediaDevices() {
  const [devices, setDevices] = createSignal({ audio: [], video: [] });
  const [selectedMic, setSelectedMic] = createSignal("");
  const [selectedCam, setSelectedCam] = createSignal("");

  const loadDevices = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((d) => d.kind === "audioinput");
      const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
      setDevices({ audio: audioInputs, video: videoInputs });

      if (audioInputs.length && !selectedMic()) {
        setSelectedMic(audioInputs[0].deviceId);
      }
      if (videoInputs.length && !selectedCam()) {
        setSelectedCam(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error("Error enumerating devices:", err);
    }
  };

  return {
    devices,
    selectedMic,
    setSelectedMic,
    selectedCam,
    setSelectedCam,
    loadDevices,
  };
}
