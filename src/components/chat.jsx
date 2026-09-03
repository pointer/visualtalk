import { RoomEvent } from "livekit-client";

export const CHAT_TOPIC = "vt-chat";
export const FILE_TOPIC = "vt-file";
export const CHUNK_SIZE = 32768; // 32KB — safe for LiveKit data channels

/**
 * Send a text chat message.
 */
export function sendChatMessage(room, text, senderName) {
  if (!room?.localParticipant) {
    throw new Error("Not connected to room");
  }

  const message = {
    type: "chat",
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender: room.localParticipant.identity,
    senderName: senderName || room.localParticipant.identity,
    text,
    timestamp: Date.now(),
  };

  const encoder = new TextEncoder();
  room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
    reliable: true,
    topic: CHAT_TOPIC,
  });

  return message;
}

/**
 * Broadcast file metadata before sending chunks.
 */
export function sendFileStart(room, fileInfo, senderName) {
  if (!room?.localParticipant) return;

  const message = {
    type: "file-start",
    id: fileInfo.id,
    sender: room.localParticipant.identity,
    senderName: senderName || room.localParticipant.identity,
    fileName: fileInfo.name,
    fileSize: fileInfo.size,
    totalChunks: fileInfo.totalChunks,
    timestamp: Date.now(),
  };

  const encoder = new TextEncoder();
  room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
    reliable: true,
    topic: FILE_TOPIC,
  });
}

/**
 * Send a single binary file chunk.
 * Format: [4 bytes idLen][id bytes][4 bytes sequence][chunk bytes]
 */
export function sendFileChunk(room, chunk, fileId, sequence) {
  if (!room?.localParticipant) return;

  const idBytes = new TextEncoder().encode(fileId);
  const buffer = new ArrayBuffer(4 + idBytes.length + 4 + chunk.length);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  view.setUint32(0, idBytes.length, true);
  uint8.set(idBytes, 4);
  view.setUint32(4 + idBytes.length, sequence, true);
  uint8.set(new Uint8Array(chunk), 8 + idBytes.length);

  room.localParticipant.publishData(uint8, {
    reliable: true,
    topic: FILE_TOPIC,
  });
}

/**
 * Broadcast that all chunks have been sent.
 */
export function sendFileComplete(room, fileId) {
  if (!room?.localParticipant) return;

  const message = {
    type: "file-complete",
    id: fileId,
    timestamp: Date.now(),
  };

  const encoder = new TextEncoder();
  room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
    reliable: true,
    topic: FILE_TOPIC,
  });
}

/**
 * Subscribe to chat and file data channel events.
 * Returns cleanup function.
 */
export function setupChatListener(room, handlers) {
  if (!room) return () => {};

  const handleData = (payload, participant, kind, topic) => {
    // Try to parse as JSON first (text messages and control frames)
    try {
      const text = new TextDecoder().decode(payload);
      const data = JSON.parse(text);

      if (data.type === "chat" && handlers.onChatMessage) {
        handlers.onChatMessage(data);
      } else if (data.type === "file-start" && handlers.onFileStart) {
        handlers.onFileStart(data);
      } else if (data.type === "file-complete" && handlers.onFileComplete) {
        handlers.onFileComplete(data);
      }
      return;
    } catch {
      // Not JSON — treat as binary file chunk
    }

    if (topic !== FILE_TOPIC || !handlers.onFileChunk) return;

    // Parse binary chunk envelope
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const idLen = view.getUint32(0, true);
    const idBytes = payload.slice(4, 4 + idLen);
    const fileId = new TextDecoder().decode(idBytes);
    const sequence = view.getUint32(4 + idLen, true);
    const chunkData = payload.slice(8 + idLen);

    handlers.onFileChunk(fileId, sequence, chunkData, participant);
  };

  room.on(RoomEvent.DataReceived, handleData);
  return () => room.off(RoomEvent.DataReceived, handleData);
}