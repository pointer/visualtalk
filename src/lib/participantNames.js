export function normalizeDisplayName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (
    !name ||
    Array.from(name).length > 80 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(name)
  ) {
    return null;
  }
  return name;
}

export function localParticipantTileName(displayName) {
  return normalizeDisplayName(displayName) || "You (Local)";
}

export function remoteParticipantTileName(name, identity) {
  return name || identity;
}
