import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n/I18nProvider";

export function NotesTab(props) {
  const { t } = useI18n();
  const [notes, setNotes] = createSignal("");
  const [isSaving, setIsSaving] = createSignal(false);

  onMount(async () => {
    try {
      const content = await invoke("get_user_notes");
      setNotes(content);
    } catch (err) {
      console.error("Failed to load notes:", err);
    }
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke("update_user_notes", { notes: notes() });
      if (props.onSaveComplete) {
        props.onSaveComplete();
      }
    } catch (err) {
      console.error("Failed to save notes:", err);
      alert(t("notes.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div class="flex flex-col h-full p-6 max-w-4xl mx-auto w-full">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-2xl font-semibold text-white">{t("notes.title")}</h2>
          <p class="text-sm text-gray-400">{t("notes.description")}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving()}
          class={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            isSaving()
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg"
          }`}
        >
          {isSaving() ? t("notes.saving") : t("notes.save")}
        </button>
      </div>
      <textarea
        value={notes()}
        onInput={(e) => setNotes(e.currentTarget.value)}
        class="flex-1 w-full p-4 rounded-xl bg-[#1c1c1c] border border-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-600/50 resize-none font-mono text-sm leading-relaxed"
        placeholder={t("notes.placeholder")}
      />
    </div>
  );
}
