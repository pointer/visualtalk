/**
 * Human text for LiveKit's `DisconnectReason` enum.
 *
 * `RoomEvent.Disconnected` hands us the numeric protobuf value, which is
 * useless in a dialog — a duplicate-identity kick used to read as
 * "Disconnected from the meeting (2)". The numbers mirror `livekit.DisconnectReason`
 * in the installed `livekit-client`; they are wire values, so never renumber.
 */
const REASONS = {
  0: "unknown reason",
  1: "you left the meeting",
  2: "another participant joined with the same identity",
  3: "the server shut down",
  4: "a participant was removed",
  5: "the room was deleted",
  6: "the server and this client disagreed about the meeting state",
  7: "joining the meeting failed",
  8: "the connection was migrated",
  9: "the signalling connection closed",
  10: "the room was closed",
  11: "the user is unavailable",
  12: "the user was rejected",
  13: "the SIP trunk failed",
  14: "the connection timed out",
  15: "media delivery failed",
  16: "the server agent errored",
};

/** LiveKit's `DUPLICATE_IDENTITY` — two connections presented the same identity. */
export const DUPLICATE_IDENTITY = 2;

/**
 * The same enum by name, for callers (or older clients) that pass
 * `"DUPLICATE_IDENTITY"` instead of `2`.
 */
const REASON_NAMES = {
  UNKNOWN_REASON: 0,
  CLIENT_INITIATED: 1,
  DUPLICATE_IDENTITY: 2,
  SERVER_SHUTDOWN: 3,
  PARTICIPANT_REMOVED: 4,
  ROOM_DELETED: 5,
  STATE_MISMATCH: 6,
  JOIN_FAILURE: 7,
  MIGRATION: 8,
  SIGNAL_CLOSE: 9,
  ROOM_CLOSED: 10,
  USER_UNAVAILABLE: 11,
  USER_REJECTED: 12,
  SIP_TRUNK_FAILURE: 13,
  CONNECTION_TIMEOUT: 14,
  MEDIA_FAILURE: 15,
  AGENT_ERROR: 16,
};

/**
 * Describe a disconnect for the user. `reason` may be the numeric enum, its
 * name, or absent (older livekit-client builds and plain socket drops).
 */
export function describeDisconnect(reason) {
  const label = reasonText(reason);
  const base = `Disconnected from the meeting${label ? ` (${label})` : ""}.`;
  if (isDuplicateIdentity(reason)) {
    return (
      `${base} The server keeps only one connection per identity, so the earlier ` +
      "one was dropped. If several people used the same invite link, each guest " +
      "needs their own link; otherwise close the other window or device that is " +
      "in this meeting, then rejoin."
    );
  }
  return `${base} You can rejoin the meeting.`;
}

/** True when the disconnect was caused by a shared LiveKit identity. */
export function isDuplicateIdentity(reason) {
  return reasonCode(reason) === DUPLICATE_IDENTITY;
}

function reasonCode(reason) {
  if (reason === null || reason === undefined || reason === "") return null;
  if (typeof reason === "string") {
    const byName = REASON_NAMES[reason.trim().toUpperCase()];
    if (byName !== undefined) return byName;
  }
  const code = Number(reason);
  return Number.isInteger(code) ? code : null;
}

function reasonText(reason) {
  const code = reasonCode(reason);
  if (code !== null && REASONS[code]) return REASONS[code];
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  return "";
}