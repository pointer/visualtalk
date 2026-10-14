import { createSignal, createEffect, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { RoomEvent } from "livekit-client";
import * as chat from "./chat";
import { useI18n } from "../i18n/I18nProvider";

// Compile-time feature flag — tree-shaken out in community builds
const E2EE_ENABLED = typeof __E2EE_ENABLED__ !== "undefined" && __E2EE_ENABLED__ === true;

export function ChatPanel(props) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = createSignal([]);
  const [inputText, setInputText] = createSignal("");
  const [isUploading, setIsUploading] = createSignal(false);
  const [uploadProgress, setUploadProgress] = createSignal(0);
  const [activeTransfers, setActiveTransfers] = createSignal({});
  const [e2eeActive, setE2eeActive] = createSignal(false);
  const [aiSettings, setAiSettings] = createSignal(null);
  const [aiThinking, setAiThinking] = createSignal(false);

  // ── UGC moderation (App Store Review Guideline 1.2) ──
  // Chat is user-generated content, so every message needs a way to flag it and
  // a way to block its author. Reports go to the *meeting organizer*, not the
  // app publisher: the publisher never sees meeting content (especially with
  // E2EE on) and therefore cannot moderate it, whereas the organizer chose the
  // server and owns the meeting.
  const [reportContact, setReportContact] = createSignal({ organizer: "", support: "" });
  const [blocked, setBlocked] = createSignal([]);
  const [reported, setReported] = createSignal([]);

  const isBlocked = (id) => !!id && blocked().includes(id);

  /// Messages to render, with blocked senders filtered out. Blocking is a local
  /// view filter only — it cannot remove anyone from the room, since that
  /// authority belongs to the organizer on the LiveKit server.
  const visibleMessages = () => messages().filter((m) => !isBlocked(m.sender));

  const reportMessage = async (msg) => {
    const to = (reportContact().organizer || "").trim();
    if (!to) {
      alert(t("chat.reportNoAddress"));
      return;
    }
    // Truncate the excerpt: a pasted megabyte must not become an unusable
    // mailto URL, and the organizer only needs enough to identify the message.
    const excerpt = String(msg.text || msg.fileName || "").slice(0, 500);
    const body = [
      t("chat.reportBodyPrompt"),
      "",
      `Room: ${props.room?.name || ""}`,
      `Reported participant: ${msg.sender || ""}`,
      `Display name: ${msg.senderName || ""}`,
      `Sent at: ${msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ""}`,
      `Message ID: ${msg.id || ""}`,
      "",
      "--- Reported content ---",
      excerpt,
      "--- End of reported content ---",
      "",
      `Reported by: ${props.displayName || ""}`,
    ].join("\n");

    try {
      await openUrl(
        `mailto:${encodeURIComponent(to)}` +
          `?subject=${encodeURIComponent(t("chat.reportSubject"))}` +
          `&body=${encodeURIComponent(body)}`
      );
      // Remember the report so the affordance changes state and a second flag on
      // the same message is visibly redundant rather than silently repeated.
      if (msg.id && !reported().includes(msg.id)) {
        setReported([...reported(), msg.id]);
      }
    } catch (err) {
      console.error("Failed to open report email:", err);
      alert(t("chat.reportFailed"));
    }
  };

  const blockSender = async (msg) => {
    const id = msg.sender;
    if (!id || isBlocked(id)) return;
    if (!confirm(t("chat.blockConfirm"))) return;
    try {
      const next = await invoke("set_participant_blocked", { identity: id, blocked: true });
      setBlocked(next);
      // Tell the meeting so the video grid and remote audio drop this
      // participant immediately, not just the chat transcript.
      props.onBlocked?.(next);
    } catch (err) {
      console.error("Failed to block participant:", err);
      alert(t("chat.blockFailed"));
    }
  };

  let messagesEndRef = null;
  let storedPublicKeyB64 = null; // Stored for re-broadcasting on new participants
  let aiConsentGiven = false; // One-time consent for cloud AI while E2EE is active

  onMount(async () => {
    try {
      setAiSettings(await invoke("get_ai_settings"));
    } catch (err) {
      console.warn("AI settings unavailable:", err);
    }
    // Moderation state. Loaded independently of the AI settings above and
    // non-fatally: if either fails, chat must still work — the report button
    // degrades to an explanatory alert rather than breaking the meeting.
    try {
      setReportContact(await invoke("get_report_contact"));
    } catch (err) {
      console.warn("Report contact unavailable:", err);
    }
    try {
      setBlocked(await invoke("get_blocked_participants"));
    } catch (err) {
      console.warn("Block list unavailable:", err);
    }
  });

  createEffect(() => {
    messages();
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  createEffect(() => {
    const room = props.room;
    if (!room) return;

    // Initialize E2EE session and set up listener
    let cleanupListener = null;
    let cleanupParticipant = null;

    const setup = async () => {
      // Initialize E2EE via Rust backend if enabled
      if (E2EE_ENABLED) {
        try {
          storedPublicKeyB64 = await invoke("e2ee_init", {
            localIdentity: room.localParticipant.identity,
          });
          setE2eeActive(true);
          if (props.onE2EEStatus) props.onE2EEStatus(true);

          // Broadcast our public key to existing participants
          chat.sendPublicKey(room, storedPublicKeyB64);

          // Re-broadcast when new participants join
          const onParticipantConnected = () => {
            if (storedPublicKeyB64) {
              chat.sendPublicKey(room, storedPublicKeyB64);
            }
          };
          room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
          cleanupParticipant = () =>
            room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
        } catch (err) {
          console.warn("E2EE initialization failed, using plaintext:", err);
          storedPublicKeyB64 = null;
        }
      }

      // Set up chat listener — e2eeActive flag controls Rust crypto path
      cleanupListener = chat.setupChatListener(
        room,
        {
          onChatMessage: (msg) => {
            setMessages((prev) => [...prev, { ...msg, kind: "chat" }]);
          },
          onKeyExchange: () => {
            // Peer key imported in Rust — nothing extra needed in UI
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
        },
        e2eeActive()
      );
    };
    setup();

    return () => {
      if (cleanupListener) cleanupListener();
      if (cleanupParticipant) cleanupParticipant();
      // Clean up Rust E2EE session when room changes
      if (E2EE_ENABLED) {
        invoke("e2ee_destroy").catch(() => {});
      }
    };
  });

  const handleSend = async () => {
    const text = inputText().trim();
    if (!text || !props.room) return;

    // ── AI assistant path: "@ai <question>" (local only, never broadcast) ──
    const aiMatch = text.match(/^@ai\s+([\s\S]+)/i);
    if (aiMatch && aiSettings()?.enabled) {
      setInputText("");
      askAi(aiMatch[1].trim());
      return;
    }

    const msg = await chat.sendChatMessage(props.room, text, props.displayName, e2eeActive());
    setMessages((prev) => [...prev, { ...msg, kind: "chat", isLocal: true }]);
    setInputText("");
  };

  /** True when the AI endpoint is remote (not localhost). */
  const isRemoteAiEndpoint = () => {
    const url = (aiSettings()?.base_url || "").toLowerCase();
    return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
  };

  /** Build the last ~20 conversation turns as LLM context. */
  const buildAiHistory = () =>
    messages()
      .filter((m) => m.kind === "chat" || m.kind === "ai" || m.kind === "ai-request")
      .slice(-20)
      .map((m) => ({
        role: m.kind === "ai" ? "assistant" : "user",
        content:
          m.kind === "chat" && !m.isLocal && m.senderName
            ? `${m.senderName}: ${m.text}`
            : m.text,
      }));

  const askAi = async (question) => {
    // E2EE guardrail: cloud AI leaves the encrypted perimeter — ask once.
    if (e2eeActive() && isRemoteAiEndpoint() && !aiConsentGiven) {
      const host = (() => {
        try {
          return new URL(aiSettings().base_url).host;
        } catch {
          return aiSettings()?.base_url;
        }
      })();
      if (!window.confirm(t("chat.ai.consent", { host }))) return;
      aiConsentGiven = true;
    }

    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setMessages((prev) => [
      ...prev,
      {
        kind: "ai-request",
        id: requestId,
        senderName: props.displayName || "You",
        text: question,
        timestamp: Date.now(),
        isLocal: true,
      },
    ]);
    setAiThinking(true);

    try {
      const reply = await invoke("ask_ai", {
        prompt: question,
        history: buildAiHistory().slice(0, -1), // exclude the question we just added
      });
      setMessages((prev) => [
        ...prev,
        {
          kind: "ai",
          id: `${requestId}-reply`,
          requestId,
          senderName: t("chat.ai.assistantName"),
          text: reply,
          timestamp: Date.now(),
          shared: false,
        },
      ]);
    } catch (err) {
      console.error("AI request failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          kind: "ai-error",
          id: `${requestId}-error`,
          senderName: t("chat.ai.assistantName"),
          text: String(err),
          question,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setAiThinking(false);
    }
  };

  /** Broadcast an AI reply to all participants through the normal chat path. */
  const shareAiMessage = async (msg) => {
    if (!props.room || msg.shared) return;
    try {
      await chat.sendChatMessage(
        props.room,
        `🤖 ${msg.text}`,
        t("chat.ai.assistantName"),
        e2eeActive()
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, shared: true } : m))
      );
    } catch (err) {
      console.error("Failed to share AI reply:", err);
    }
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

      await chat.sendFileStart(
        props.room,
        { id: fileId, name: info.name, size: info.size, totalChunks },
        props.displayName,
        e2eeActive()
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

        await chat.sendFileChunk(props.room, chunk, fileId, i, e2eeActive());

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

      await chat.sendFileComplete(props.room, fileId, e2eeActive());

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
    // hourCycle "h23" → always 24h (00–23), independent of the OS locale.
    return new Date(ts).toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
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
        <h3 class="text-sm font-semibold text-white">{t("chat.title")}</h3>
        <button
          onClick={props.onClose}
          class="text-gray-400 hover:text-white transition p-1 rounded hover:bg-[#2a2a2a]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* E2EE Banner */}
      <Show when={e2eeActive()}>
        <div class="px-4 py-1.5 bg-emerald-900/30 border-b border-emerald-800/40 flex items-center gap-1.5">
          <svg class="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span class="text-[10px] text-emerald-300 font-medium">End-to-end encrypted</span>
        </div>
      </Show>
      <Show when={E2EE_ENABLED && !e2eeActive()}>
        <div class="px-4 py-1.5 bg-amber-900/20 border-b border-amber-800/30 flex items-center gap-1.5">
          <svg class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span class="text-[10px] text-amber-300 font-medium">{t("chat.notEncrypted")}</span>
        </div>
      </Show>
      <Show when={aiSettings()?.enabled}>
        <div class="px-4 py-1.5 bg-purple-900/20 border-b border-purple-800/30 flex items-center gap-1.5">
          <svg class="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <span class="text-[10px] text-purple-300 font-medium">{t("chat.ai.hint")}</span>
        </div>
      </Show>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        <For each={visibleMessages()}>
          {(msg) => (
            <div class={`flex flex-col ${msg.isLocal ? "items-end" : "items-start"}`}>
              <div
                class={`max-w-[92%] rounded-xl px-3 py-2 ${
                  msg.isLocal
                    ? "bg-blue-600/90"
                    : msg.kind === "ai" || msg.kind === "ai-error"
                    ? "bg-purple-900/30 border border-purple-700/40"
                    : "bg-[#2a2a2a]"
                }`}
              >
                <div class="flex items-center gap-2 mb-1">
                  <Show when={msg.kind === "ai" || msg.kind === "ai-error"}>
                    <svg class="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </Show>
                  <span class={`text-[10px] font-medium ${msg.kind === "ai" || msg.kind === "ai-error" ? "text-purple-300" : "text-gray-300"}`}>
                    {msg.senderName}
                  </span>
                  <span class="text-[9px] text-gray-500">{formatTime(msg.timestamp)}</span>
                </div>

                <Show when={msg.kind === "chat" || msg.kind === "ai-request"}>
                  <p class="text-sm text-white whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                </Show>

                <Show when={msg.kind === "ai"}>
                  <p class="text-sm text-white whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                  <Show when={!msg.shared}>
                    <button
                      onClick={() => shareAiMessage(msg)}
                      class="mt-1.5 text-[10px] text-purple-400 hover:text-purple-300 transition flex items-center gap-1"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      {t("chat.ai.share")}
                    </button>
                  </Show>
                  <Show when={msg.shared}>
                    <span class="mt-1.5 text-[10px] text-gray-500 flex items-center gap-1">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                      {t("chat.ai.shared")}
                    </span>
                  </Show>
                </Show>

                <Show when={msg.kind === "ai-error"}>
                  <p class="text-sm text-red-300 whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                  <button
                    onClick={() => askAi(msg.question)}
                    class="mt-1.5 text-[10px] text-purple-400 hover:text-purple-300 transition flex items-center gap-1"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t("chat.ai.retry")}
                  </button>
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
                        {t("chat.openFile")}
                      </button>
                    </Show>
                  </div>
                </Show>
              </div>

              {/* Moderation affordances for user-generated content. Shown only on
                  other people's messages — flagging or blocking your own would be
                  meaningless. AI output is excluded: it is generated locally from
                  the user's own prompt, not submitted by another participant. */}
              <Show when={!msg.isLocal && msg.sender && msg.kind !== "ai" && msg.kind !== "ai-error"}>
                <div class="flex items-center gap-3 mt-1 px-1">
                  <button
                    onClick={() => reportMessage(msg)}
                    disabled={!!msg.id && reported().includes(msg.id)}
                    class="text-[10px] text-gray-500 hover:text-amber-400 disabled:text-gray-600 disabled:cursor-default transition"
                    title={t("chat.report")}
                  >
                    {msg.id && reported().includes(msg.id) ? t("chat.reported") : t("chat.report")}
                  </button>
                  <button
                    onClick={() => blockSender(msg)}
                    class="text-[10px] text-gray-500 hover:text-red-400 transition"
                    title={t("chat.block")}
                  >
                    {t("chat.block")}
                  </button>
                </div>
              </Show>
            </div>
          )}
        </For>
        <Show when={aiThinking()}>
          <div class="flex flex-col items-start">
            <div class="max-w-[92%] rounded-xl px-3 py-2 bg-purple-900/30 border border-purple-700/40">
              <div class="flex items-center gap-2">
                <svg class="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span class="text-[10px] font-medium text-purple-300">{t("chat.ai.assistantName")}</span>
                <span class="flex items-center gap-1 ml-1">
                  <span class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
                  <span class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 150ms" />
                  <span class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 300ms" />
                </span>
              </div>
            </div>
          </div>
        </Show>
        {visibleMessages().length === 0 && (
          <div class="text-center text-gray-500 text-sm mt-10">{t("chat.noMessages")}</div>
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
            title={t("chat.sendFile")}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            type="text"
            placeholder={t("chat.placeholder")}
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
              <span>{t("chat.uploading")}</span>
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