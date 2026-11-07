import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "../../lib/ipc";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../../i18n/I18nProvider";
import { IS_MOBILE } from "../../lib/platform";

/**
 * Recordings folder and the recordings already on disk.
 *
 * Recordings default to <app_config_dir>/recordings, which is real but
 * undiscoverable - on macOS it sits under ~/Library/Application Support - so the
 * path is shown verbatim with a reveal button and can be relocated. Local
 * recording needs MediaRecorder, which WKWebView does not implement, so on iOS
 * this section explains that rather than pointing at a folder that stays empty.
 *
 * Owns its state and loads on mount, so the two invokes only happen when the
 * Recordings tab is opened.
 */
export function RecordingsSection() {
  const { t } = useI18n();

  // ── Recordings folder ──
  // Recordings default to <app_config_dir>/recordings, which is real but
  // undiscoverable — the folder lives under ~/Library/Application Support on
  // macOS. Surfacing the path here (plus reveal / relocate) is what makes a
  // finished recording findable.
  const [recDir, setRecDir] = createSignal({ path: "", is_default: true, exists: false });
  const [recFiles, setRecFiles] = createSignal([]);
  const [recBusy, setRecBusy] = createSignal(false);

  const loadRecordings = async () => {
    const [dir, files] = await Promise.all([
      invoke("get_recordings_dir").catch(() => null),
      invoke("get_local_recordings").catch(() => []),
    ]);
    if (dir) setRecDir(dir);
    setRecFiles(Array.isArray(files) ? files : []);
  };

  // Native folder picker. Handled in Rust's dialog plugin (already a
  // dependency) rather than `<input type="file" webkitdirectory>`, which
  // WKWebView does not support for directories.
  const chooseRecordingsDir = async () => {
    setRecBusy(true);
    try {
      const picked = await dialogOpen({ directory: true, multiple: false });
      if (!picked) return; // cancelled
      setRecDir(await invoke("set_recordings_dir", { path: picked }));
      await loadRecordings();
    } catch (err) {
      console.error("Failed to change recordings folder:", err);
      alert(`${t("settings.recordings.changeFailed")}: ${err}`);
    } finally {
      setRecBusy(false);
    }
  };

  const resetRecordingsDir = async () => {
    setRecBusy(true);
    try {
      setRecDir(await invoke("set_recordings_dir", { path: null }));
      await loadRecordings();
    } catch (err) {
      console.error("Failed to reset recordings folder:", err);
      alert(`${t("settings.recordings.changeFailed")}: ${err}`);
    } finally {
      setRecBusy(false);
    }
  };

  // Reveal a recording in the file manager. Uses `revealItemInDir` rather than
  // `openPath` on purpose: the opener capability scopes `open-path` to
  // $APPCONFIG/*, which would reject any user-relocated folder, whereas
  // `reveal-item-in-dir` is granted unrestricted by `opener:default`.
  const revealRecording = async (path) => {
    try {
      await revealItemInDir(path);
    } catch (err) {
      console.error("Failed to reveal recording:", err);
      alert(`${t("settings.recordings.revealFailed")}: ${err}`);
    }
  };

  const revealRecordingsDir = async () => {
    // Reveal the newest file when there is one: that opens the folder *and*
    // selects the recording the user is looking for. Falling back to the folder
    // itself still lands them in the right place.
    const newest = recFiles()[0];
    await revealRecording(newest ? newest.path : recDir().path);
  };

  const deleteRecording = async (path) => {
    if (!confirm(t("settings.recordings.deleteConfirm"))) return;
    try {
      await invoke("delete_recording", { filePath: path });
      await loadRecordings();
    } catch (err) {
      console.error("Failed to delete recording:", err);
      alert(`${t("settings.recordings.deleteFailed")}: ${err}`);
    }
  };

  onMount(loadRecordings);

  const formatBytes = (n) => {
    if (!n && n !== 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div class="w-full max-w-2xl bg-[#1c1c1c] rounded-2xl p-4 sm:p-6 shadow-xl border border-[#2a2a2a]">
      <h3 class="text-lg font-semibold mb-4">{t("settings.recordings.title")}</h3>

      <div class="bg-[#1a1a1a] rounded-lg p-4 mb-4">
        <label class="block text-sm font-medium text-gray-300 mb-2">
          {t("settings.recordings.folder")}
        </label>
        <p class="font-mono text-xs text-gray-400 break-all bg-[#0f0f0f] rounded px-3 py-2 border border-[#2a2a2a]">
          {recDir().path || "…"}
        </p>
        {/* defaultHint invites the user to relocate the folder, but the
            Change button below is desktop-only — so don't advertise an
            action this platform cannot perform. */}
        <Show when={recDir().is_default && !IS_MOBILE}>
          <p class="mt-2 text-xs text-gray-500">{t("settings.recordings.defaultHint")}</p>
        </Show>
        {/* Local recording needs MediaRecorder, which WKWebView does not
            implement, so no iOS build can write a recording yet. Say so
            plainly rather than pointing at a folder that will stay empty
            (the Documents/Recordings default and the file-sharing plist
            keys are provisioned ahead of that feature — see lib.rs). */}
        <Show when={IS_MOBILE}>
          <p class="mt-2 text-xs text-gray-500">{t("settings.recordings.mobileHint")}</p>
        </Show>
        <Show when={recDir().path && !recDir().exists}>
          <p class="mt-2 text-xs text-amber-400">{t("settings.recordings.missing")}</p>
        </Show>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            onClick={revealRecordingsDir}
            class="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
          >
            {t("settings.recordings.open")}
          </button>
          <Show when={!IS_MOBILE}>
            <button
              onClick={chooseRecordingsDir}
              disabled={recBusy()}
              class="px-3 py-2 text-sm bg-[#2a2a2a] hover:bg-[#333] border border-[#3a3a3a] rounded-lg transition disabled:opacity-50"
            >
              {t("settings.recordings.change")}
            </button>
            <Show when={!recDir().is_default}>
              <button
                onClick={resetRecordingsDir}
                disabled={recBusy()}
                class="px-3 py-2 text-sm text-gray-400 hover:text-white bg-[#2a2a2a] hover:bg-[#333] border border-[#3a3a3a] rounded-lg transition disabled:opacity-50"
              >
                {t("settings.recordings.reset")}
              </button>
            </Show>
          </Show>
        </div>
      </div>
      {/* Existing recordings, newest first. Listed here because a file
          the user cannot find is indistinguishable from a recording
          that was never saved. */}
      <div class="bg-[#1a1a1a] rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <label class="block text-sm font-medium text-gray-300">
            {t("settings.recordings.files")}
          </label>
          <span class="text-xs text-gray-500">{recFiles().length}</span>
        </div>

        <Show when={recFiles().length === 0}>
          <p class="text-sm text-gray-500 py-4 text-center">
            {t(IS_MOBILE ? "settings.recordings.noneMobile" : "settings.recordings.none")}
          </p>
        </Show>

        <div class="space-y-2">
          <For each={recFiles()}>
            {(file) => (
              <div class="flex items-center gap-2 bg-[#0f0f0f] rounded px-3 py-2">
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-200 truncate">{file.name}</p>
                  <p class="text-xs text-gray-500">
                    {formatBytes(file.size_bytes)}
                    <Show when={file.created}>
                      {" · "}
                      {new Date(file.created * 1000).toLocaleString()}
                    </Show>
                  </p>
                </div>
                <button
                  onClick={() => revealRecording(file.path)}
                  class="shrink-0 text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  {t("settings.recordings.reveal")}
                </button>
                <button
                  onClick={() => deleteRecording(file.path)}
                  class="shrink-0 text-xs text-red-400 hover:text-red-300 transition"
                >
                  {t("settings.recordings.delete")}
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
