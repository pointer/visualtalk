import { createSignal, createEffect, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import * as chat from "../lib/chat";

export function ChatPanel(props) {
  const [messages, setMessages] = createSignal([]);
  const [inputText, setInputText] = createSignal("");
  const [isUploading, setIsUploading] = createSignal(false);
  const [uploadProgress, setUploadProgress] = createSignal(0);
  const [activeTransfers, setActiveTransfers] = createSignal({});

  let messagesEndRef = null;

  createEffect(() => {
    messages();
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  createEffect(() => {
    const room = props.room;
    if (!room) return;

    const cleanup = chat.setupChatListener(room, {
      onChatMessage: (msg) => {
        setMessages((prev) => [...prev, { ...msg, kind: "chat" }]);
      },
      onFileStart: (data) => {
        setActiveTransfers((prev) => ({
          ...prev,
          [data.id]: {
            fileName: data.fileName,
            fileSize: data.fileSize,
            totalChunks: data.totalChunks,
            chunks: new Array(data.totalChunks).fill(null),
            receivedChunks: 0,
            senderName: data.senderName,
            timestamp: data.timestamp,
          },
        }));
        setMessages((prev) => [
          ...prev,
          {
            kind: "file-incoming",
            id: data.id,
            fileName: data.fileName,
            fileSize: data.fileSize,
            senderName: data.senderName,
            timestamp: data.timestamp,
            progress: 0,
          },
        ]);
      },
      onFileChunk: (fileId, sequence, chunkData) => {
        setActiveTransfers((prev) => {
          const transfer = prev[fileId];
          if (!transfer) return prev;

          const newChunks = [...transfer.chunks];
          newChunks[sequence] = chunkData;
          const received = newChunks.filter((c) => c !== null).length;

          setMessages((msgs) =>
            msgs.map((m) =>
              m.id === fileId && m.kind === "file-incoming"
                ? { ...m, progress: Math.round((received / transfer.totalChunks) * 100) }
                : m
            )
          );

          return {
            ...prev,
            [fileId]: { ...transfer, chunks: newChunks, receivedChunks: received },
          };
        });
      },
      onFileComplete: async (data) => {
        const transfer = activeTransfers()[data.id];
        if (!transfer) return;

        const totalSize = transfer.chunks.reduce(
          (sum, c) => sum + (c?.length || 0),
          0
        );
        const assembled = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of transfer.chunks) {
          if (chunk) {
            assembled.set(chunk, offset);
            offset += chunk.length;
          }
        }

        try {
          const savedPath = await invoke("save_download", {
            filename: transfer.fileName,
            data: Array.from(assembled),
          });

          setMessages((msgs) =>
            msgs.map((m) =>
              m.id === data.id && m.kind === "file-incoming"
                ? { ...m, kind: "file", savedPath, status: "completed" }
                : m
            )
          );
        } catch (err) {
          console.error("Failed to save file:", err);
          setMessages((msgs) =>
            msgs.map((m) =>
              m.id === data.id && m.kind === "file-incoming"
                ? { ...m, kind: "file", status: "error", error: String(err) }
                : m
            )
          );
        }

        setActiveTransfers((prev) => {
          const next = { ...prev };
          delete next[data.id];
          return next;
        });
      },
    });

    return cleanup;
  });

  const handleSend = () => {
    const text = inputText().trim();
    if (!text || !props.room) return;

    const msg = chat.sendChatMessage(props.room, text, props.displayName);
    setMessages((prev) => [...prev, { ...msg, kind: "chat", isLocal: true }]);
    setInputText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async () => {
    if (!props.room) return;

    try {
      const path = await invoke("pick_file");
      if (!path) return;

      const info = await invoke("get_file_info", { path });
      const totalChunks = Math.ceil(info.size / chat.CHUNK_SIZE);
      const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      setIsUploading(true);
      setUploadProgress(0);

      chat.sendFileStart(
        props.room,
        { id: fileId, name: info.name, size: info.size, totalChunks },
        props.displayName
      );

      setMessages((prev) => [
        ...prev,
        {
          kind: "file-upload",
          id: fileId,
          fileName: info.name,
          fileSize: info.size,
          senderName: "You",
          timestamp: Date.now(),
          progress: 0,
          isLocal: true,
        },
      ]);

      for (let i = 0; i < totalChunks; i++) {
        const offset = i * chat.CHUNK_SIZE;
        const chunkBase64 = await invoke("read_file_chunk", {
          path,
          offset,
          chunkSize: chat.CHUNK_SIZE,
        });

        const binaryString = atob(chunkBase64);
        const chunk = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) {
          chunk[j] = binaryString.charCodeAt(j);
        }

        chat.sendFileChunk(props.room, chunk, fileId, i);

        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress(progress);
        setMessages((msgs) =>
          msgs.map((m) =>
            m.id === fileId && m.kind === "file-upload"
              ? { ...m, progress }
              : m
          )
        );
      }

      chat.sendFileComplete(props.room, fileId);

      setMessages((msgs) =>
        msgs.map((m) =>
          m.id === fileId && m.kind === "file-upload"
            ? { ...m, status: "completed" }
            : m
        )
      );
    } catch (err) {
      console.error("File upload failed:", err);
      alert(`Failed to send file: ${err}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (ts) => {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openSavedFile = async (path) => {
    try {
      await openPath(path);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  };

  return (
    <div class="flex flex-col w-80 h-full bg-[#1a1a1a] border-l border-[#2a2a2a] shrink-0 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div class="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
        <h3 class="text-sm font-semibold text-white">Meeting Chat</h3>
        <button
          onClick={props.onClose}
          class="text-gray-400 hover:text-white transition p-1 rounded hover:bg-[#2a2a2a]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        <For each={messages()}>
          {(msg) => (
            <div class={`flex flex-col ${msg.isLocal ? "items-end" : "items-start"}`}>
              <div
                class={`max-w-[92%] rounded-xl px-3 py-2 ${
                  msg.isLocal ? "bg-blue-600/90" : "bg-[#2a2a2a]"
                }`}
              >
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[10px] font-medium text-gray-300">
                    {msg.senderName}
                  </span>
                  <span class="text-[9px] text-gray-500">{formatTime(msg.timestamp)}</span>
                </div>

                <Show when={msg.kind === "chat"}>
                  <p class="text-sm text-white whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                </Show>

                <Show
                  when={
                    msg.kind === "file-upload" ||
                    msg.kind === "file-incoming" ||
                    msg.kind