// src/lib/permissions.ts

export async function requestMediaPermissions(): Promise<{
  camera: boolean;
  microphone: boolean;
}> {
  const result = { camera: false, microphone: false };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    // Stop tracks immediately — we just needed the permission grant
    stream.getTracks().forEach((track) => track.stop());
    result.camera = true;
    result.microphone = true;
  } catch (err) {
    // Try individually to see which one failed
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach((t) => t.stop());
      result.microphone = true;
    } catch { /* microphone denied */ }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoStream.getTracks().forEach((t) => t.stop());
      result.camera = true;
    } catch { /* camera denied */ }
  }

  return result;
}
