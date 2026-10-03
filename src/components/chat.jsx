import { invoke } from "@tauri-apps/api/core";
import { RoomEvent } from "livekit-client";

export const CHAT_TOPIC = "vt-chat";
export const FILE_TOPIC = "vt-file";
export const E2EE_TOPIC = "vt-e2ee";
export const CHUNK_SIZE = 32768; // 32KB — safe for LiveKit data channels
const IV_LENGTH = 12;

// ─── Helpers ────────────────────────────────────────────────

/** Encode Uint8Array to base64 for JSON transport. */
function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode base64 string back to Uint8Array. */
function fromBase64(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Key Exchange ───────────────────────────────────────────

/**
 * Broadcast our ECDH public key to all peers on the e2ee topic.
 * @param {Room} room - LiveKit room instance.
 * @param {string} publicKeyB64 - Base64-encoded public key from Rust.
 */
export function sendPublicKey(room, publicKeyB64) {
  if (!room?.localParticipant || !publicKeyB64) return;

  const message = {
    type: "e2ee-key",
    sender: room.localParticipant.identity,
    publicKey: publicKeyB64,
  };

  const encoder = new TextEncoder();
  room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
    reliable: true,
    topic: E2EE_TOPIC,
  });
}

// ─── Chat Messages ──────────────────────────────────────────

/**
 * Send a text chat message. When e2eeActive is true, encrypts via Rust backend.
 * @param {Room} room
 * @param {string} text
 * @param {string} senderName
 * @param {boolean} e2eeActive
 */
export async function sendChatMessage(room, text, senderName, e2eeActive) {
  if (!room?.localParticipant) throw new Error("Not connected to room");

  // ── E2EE path ──
  if (e2eeActive) {
    try {
      const encrypted = await invoke("e2ee_encrypt_chat", {
        text,
        sender: room.localParticipant.identity,
        senderName: senderName || room.localParticipant.identity,
      });

      const encoder = new TextEncoder();
      room.localParticipant.publishData(
        encoder.encode(JSON.stringify(encrypted)),
        { reliable: true, topic: CHAT_TOPIC }
      );
      return encrypted;
    } catch (err) {
      console.warn("E2EE chat failed, falling back to plaintext:", err);
    }
  }

  // ── Plaintext path (community or fallback) ──
  const base = {
    type: "chat",
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender: room.localParticipant.identity,
    senderName: senderName || room.localParticipant.identity,
    text,
    timestamp: Date.now(),
  };

  const encoder = new TextEncoder();
  room.localParticipant.publishData(encoder.encode(JSON.stringify(base)), {
    reliable: true,
    topic: CHAT_TOPIC,
  });
  return base;
}

// ─── File Transfers ─────────────────────────────────────────

/**
 * Broadcast file metadata before sending chunks.
 * When e2eeActive is true, generates a file key in Rust and wraps it for each peer.
 * @returns {Promise<void>}
 */
export async function sendFileStart(room, fileInfo, senderName, e2eeActive) {
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

  // ── E2EE: generate file key & wrap for each peer via Rust ──
  if (e2eeActive) {
    try {
      const wrappedKeys = await invoke("e2ee_prepare_file", {
        fileId: fileInfo.id,
      });
      if (Object.keys(wrappedKeys).length > 0) {
        message.encrypted = true;
        message.wrappedKeys = wrappedKeys;
      }
    } catch (err) {
      console.warn("E2EE file-start failed, sending plaintext:", err);
    }
  }

  const encoder = new TextEncoder();
  room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
    reliable: true,
    topic: FILE_TOPIC,
  });
}

/**
 * Send a single binary file chunk.
 * Format (plaintext): [4 bytes idLen][id bytes][4 bytes sequence][chunk bytes]
 * Format (encrypted): [4 bytes idLen][id bytes][4 bytes sequence][12 bytes IV][ciphertext]
 */
export async function sendFileChunk(room, chunk, fileId, sequence, e2eeActive) {
  if (!room?.localParticipant) return;

  const idBytes = new TextEncoder().encode(fileId);
  let payloadData;

  // ── E2EE: encrypt the chunk data via Rust ──
  if (e2eeActive) {
    try {
      const dataB64 = toBase64(new Uint8Array(chunk));
      const result = await invoke("e2ee_encrypt_chunk", {
        fileId,
        data: dataB64,
      });
      // Result: { iv: base64, ciphertext: base64 }
      const iv = fromBase64(result.iv);
      const ciphertext = fromBase64(result.ciphertext);
      // Payload = [12 bytes IV][ciphertext]
      const combined = new Uint8Array(iv.length + ciphertext.length);
      combined.set(iv, 0);
      combined.set(ciphertext, iv.length);
      payloadData = combined;
    } catch (err) {
      console.warn("E2EE chunk encryption failed, sending plaintext:", err);
      payloadData = new Uint8Array(chunk);
    }
  } else {
    payloadData = new Uint8Array(chunk);
  }

  const buffer = new ArrayBuffer(4 + idBytes.length + 4 + payloadData.length);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  view.setUint32(0, idBytes.length, true);
  uint8.set(idBytes, 4);
  view.setUint32(4 + idBytes.length, sequence, true);
  uint8.set(payloadData, 8 + idBytes.length);

  room.localParticipant.publishData(uint8, {
    reliable: true,
    topic: FILE_TOPIC,
  });
}

/**
 * Broadcast that all chunks have been sent. Cleans up the file key in Rust if E2EE is active.
 */
export async function sendFileComplete(room, fileId, e2eeActive) {
  if (!room?.localParticipant) return;

  // Clean up the file key in Rust — transfer is done
  if (e2eeActive) {
    try {
      await invoke("e2ee_cleanup_file", { fileId });
    } catch {
      // Key might already be cleaned up
    }
  }

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
 * Subscribe to chat, file, and E2EE data channel events.
 * All crypto operations happen in the Rust backend via invoke().
 * @param {Room} room - LiveKit room instance.
 * @param {object} handlers - Callbacks for each message type.
 * @param {boolean} e2eeActive - Whether E2EE is active.
 * @returns {Function} Cleanup function.
 */
export function setupChatListener(room, handlers, e2eeActive) {
  if (!room) return () => {};

  const handleData = async (payload, participant, kind, topic) => {
    // ── E2EE key exchange ──
    if (topic === "vt-e2ee" && e2eeActive) {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data.type === "e2ee-key" && data.sender && data.publicKey) {
          await invoke("e2ee_import_peer", {
            identity: data.sender,
            publicKeyB64: data.publicKey,
          });
          if (handlers.onKeyExchange) handlers.onKeyExchange(data);
        }
      } catch (err) {
        console.warn("Failed to process E2EE key exchange:", err);
      }
      return;
    }

    // ── JSON messages (chat, file-start, file-complete) ──
    try {
      const text = new TextDecoder().decode(payload);
      const data = JSON.parse(text);

      // Encrypted chat message — decrypt via Rust
      if (data.type === "chat" && data.encrypted && e2eeActive) {
        try {
          const decrypted = await invoke("e2ee_decrypt_chat", {
            ciphertextB64: data.ciphertext,
            ivB64: data.iv,
            wrappedKeys: data.wrappedKeys,
            sender: data.sender,
          });
          if (handlers.onChatMessage) handlers.onChatMessage(decrypted);
        } catch (err) {
          console.warn("Failed to decrypt chat message:", err);
          if (handlers.onChatMessage) {
            handlers.onChatMessage({
              ...data,
              text: "⚠️ [Failed to decrypt message]",
            });
          }
        }
        return;
      }

      // Plaintext chat message
      if (data.type === "chat" && handlers.onChatMessage) {
        handlers.onChatMessage(data);
        return;
      }

      // Encrypted file-start — unwrap file key via Rust
      if (data.type === "file-start" && data.encrypted && e2eeActive) {
        try {
          const myIdentity = room.localParticipant.identity;
          const wrapped = data.wrappedKeys?.[myIdentity];
          if (wrapped && data.sender) {
            await invoke("e2ee_unwrap_file_key", {
              fileId: data.id,
              wrappedB64: wrapped.wrapped,
              ivB64: wrapped.iv,
              sender: data.sender,
            });
          }
        } catch (err) {
          console.warn("Failed to unwrap file key:", err);
        }
        if (handlers.onFileStart) handlers.onFileStart(data);
        return;
      }

      // Plaintext file-start
      if (data.type === "file-start" && handlers.onFileStart) {
        handlers.onFileStart(data);
        return;
      }

      // File complete — clean up file key in Rust
      if (data.type === "file-complete") {
        if (e2eeActive) {
          try {
            await invoke("e2ee_cleanup_file", { fileId: data.id });
          } catch {
            // Key might already be cleaned up
          }
        }
        if (handlers.onFileComplete) handlers.onFileComplete(data);
        return;
      }

      return;
    } catch {
      // Not JSON — treat as binary file chunk
    }

    // ── Binary file chunk ──
    if (topic !== "vt-file" || !handlers.onFileChunk) return;

    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const idLen = view.getUint32(0, true);
    const idBytes = payload.slice(4, 4 + idLen);
    const fileId = new TextDecoder().decode(idBytes);
    const sequence = view.getUint32(4 + idLen, true);
    const rawChunkData = payload.slice(8 + idLen);

    // Decrypt if E2EE is active and we have a file key
    let chunkData = rawChunkData;
    if (e2eeActive && rawChunkData.length > IV_LENGTH) {
      try {
        // Encrypted format: [12 bytes IV][ciphertext]
        const iv = rawChunkData.slice(0, IV_LENGTH);
        const ciphertext = rawChunkData.slice(IV_LENGTH);
        const plaintextB64 = await invoke("e2ee_decrypt_chunk", {
          fileId,
          ivB64: toBase64(iv),
          ciphertextB64: toBase64(ciphertext),
        });
        chunkData = fromBase64(plaintextB64);
      } catch (err) {
        console.warn("Failed to decrypt file chunk:", err);
        // Fall through with raw (undecrypted) data
      }
    }

    handlers.onFileChunk(fileId, sequence, chunkData, participant);
  };

  room.on(RoomEvent.DataReceived, handleData);
  return () => room.off(RoomEvent.DataReceived, handleData);
}