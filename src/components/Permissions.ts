// src/lib/permissions.ts

export interface MediaPermissionStatus {
  camera: boolean;
  microphone: boolean;
  /** DOMException name of the failing getUserMedia call, e.g. "NotAllowedError" */
  cameraError?: string;
  microphoneError?: string;
  /** Human-readable explanation + remediation guidance when something failed. */
  message?: string;
}

/**
 * Translate a getUserMedia DOMException into a human-readable message.
 * Includes macOS-specific guidance because Tauri dev binaries and bundled
 * .apps are tracked separately by the OS privacy database (TCC).
 */
export function describeMediaError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  const name = e?.name || "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return (
        "Camera/microphone permission was denied. On macOS open System Settings → " +
        "Privacy & Security → Camera (and Microphone) and enable it for this app. " +
        "If it is not listed, run `tccutil reset Camera com.katebg.visualtalk && " +
        "tccutil reset Microphone com.katebg.visualtalk` in a terminal, then restart the app " +
        "and accept the permission prompt."
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera or microphone was detected. Check that the device is connected and not disabled in System Settings.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera/microphone is already in use by another application (or was blocked by macOS). Close other apps using the camera and try again.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "The selected camera/microphone is no longer available. Please pick a different device in Settings.";
    case "SecurityError":
      return "Media access was blocked by the webview security policy (CSP or insecure origin).";
    default:
      return `Media error${name ? ` (${name})` : ""}: ${e?.message || String(err)}`;
  }
}

export async function requestMediaPermissions(): Promise<MediaPermissionStatus> {
  const result: MediaPermissionStatus = { camera: false, microphone: false };

  if (!navigator.mediaDevices?.getUserMedia) {
    result.message =
      "navigator.mediaDevices is unavailable — the webview must run in a secure context " +
      "(tauri://localhost or http://localhost).";
    return result;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    // Stop tracks immediately — we just needed the permission grant
    stream.getTracks().forEach((track) => track.stop());
    result.camera = true;
    result.microphone = true;
    return result;
  } catch {
    // Fall through to per-device probing below.
  }

  // Probe each device individually so one denial doesn't hide the other.
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioStream.getTracks().forEach((t) => t.stop());
    result.microphone = true;
  } catch (err) {
    result.microphoneError = (err as DOMException)?.name || String(err);
  }

  try {
    const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoStream.getTracks().forEach((t) => t.stop());
    result.camera = true;
  } catch (err) {
    result.cameraError = (err as DOMException)?.name || String(err);
  }

  const problems: string[] = [];
  if (!result.camera) {
    problems.push(
      result.cameraError === "NotFoundError"
        ? "no camera detected"
        : `camera blocked (${result.cameraError || "unknown"})`
    );
  }
  if (!result.microphone) {
    problems.push(
      result.microphoneError === "NotFoundError"
        ? "no microphone detected"
        : `microphone blocked (${result.microphoneError || "unknown"})`
    );
  }
  if (problems.length) {
    result.message = `${problems.join("; ")}. ${describeMediaError({
      name: result.cameraError || result.microphoneError,
    })}`;
  }
  return result;
}
