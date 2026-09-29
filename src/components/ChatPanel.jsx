import { createSignal, createEffect, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import * as chat from "./chat";

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
                    msg.kind === "file"
                  }
                >
                  <div class="mt-1">
                    <div class="flex items-center gap-1.5 text-xs text-gray-200">
                      <svg class="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span class="truncate max-w-[140px]">{msg.fileName}</span>
                      <span class="text-[9px] text-gray-400 shrink-0">{formatFileSize(msg.fileSize)}</span>
                    </div>

                    {/* Progress bar for in-progress transfers */}
                    <Show when={msg.progress != null && msg.progress < 100}>
                      <div class="w-full bg-gray-700 rounded-full h-1.5 mt-1.5">
                        <div
                          class="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
                          style={{ width: `${msg.progress}%` }}
                        />
                      </div>
                      <span class="text-[9px] text-gray-400 mt-0.5">{msg.progress}%</span>
                    </Show>

                    {/* Completed file: show open button */}
                    <Show when={msg.status === "completed"}>
                      <button
                        onClick={() => msg.savedPath && openSavedFile(msg.savedPath)}
                        class="mt-1.5 text-[10px] text-blue-400 hover:text-blue-300 transition flex items-center gap-1"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open file
                      </button>
                    </Show>
                  </div>
                </Show>
              </div>
            </div>
          )}
        </For>
        {messages().length === 0 && (
          <div class="text-center text-gray-500 text-sm mt-10">No messages yet</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div class="px-3 py-3 border-t border-[#2a2a2a] bg-[#1c1c1c]">
        <div class="flex items-center gap-2">
          <button
            onClick={handleFileSelect}
            disabled={isUploading()}
            class="shrink-0 p-2 text-gray-400 hover:text-blue-400 disabled:text-gray-600 transition rounded-lg hover:bg-[#2a2a2a]"
            title="Send file"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText()}
            onInput={(e) => setInputText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            class="flex-1 bg-[#2a2a2a] text-white rounded-xl px-3 py-2 text-sm border border-[#3a3a3a] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-gray-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputText().trim()}
            class="shrink-0 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white rounded-xl transition"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <Show when={isUploading()}>
          <div class="mt-2">
            <div class="flex items-center gap-2 text-[10px] text-gray-400">
              <span>Uploading...</span>
              <span>{uploadProgress()}%</span>
            </div>
            <div class="w-full bg-gray-700 rounded-full h-1 mt-1">
              <div
                class="bg-blue-500 h-1 rounded-full transition-all duration-200"
                style={{ width: `${uploadProgress()}%` }}
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}