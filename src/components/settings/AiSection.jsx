import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "../../lib/ipc";
import { useI18n } from "../../i18n/I18nProvider";
import { errorI18nKey, errorMessage } from "../../lib/errors";

/**
 * AI Assistant settings (Settings -> AI).
 *
 * Owns its state and loads it on mount. Two consequences worth knowing:
 *  - `get_available_models` is a real network call to whatever endpoint is
 *    configured, so it now happens when this tab is opened instead of on every
 *    Settings open, and not at all when the user never looks at the AI tab.
 *  - the config is still `AppData.ai` in settings.json, read and written through
 *    `get_ai_settings` / `update_ai_settings`; nothing here is section-local
 *    except the status text and the busy flags.
 */
export function AiSection() {
  const { t } = useI18n();

  const [aiCfg, setAiCfg] = createSignal({
    enabled: false,
    base_url: "http://localhost:11434/v1",
    api_key: "",
    model: "llama3.2",
    system_prompt: "",
  });
  const [availableModels, setAvailableModels] = createSignal([]);
  const [aiStatus, setAiStatus] = createSignal("");
  const [aiSaving, setAiSaving] = createSignal(false);
  const [aiTesting, setAiTesting] = createSignal(false);

  // Both calls are independently non-fatal: an unreachable model endpoint must
  // not stop the saved config from loading, and vice versa.
  onMount(async () => {
    const [cfg, models] = await Promise.all([
      invoke("get_ai_settings").catch(() => null),
      invoke("get_available_models").catch(() => null),
    ]);
    if (cfg) setAiCfg(cfg);
    if (Array.isArray(models)) setAvailableModels(models);
  });

  const saveAiSettings = async () => {
    setAiSaving(true);
    setAiStatus("");
    try {
      await invoke("update_ai_settings", { settings: aiCfg() });
      setAiStatus(`✅ ${t("settings.savedSecurely")}`);
      setTimeout(() => setAiStatus(""), 3000);
    } catch (err) {
      setAiStatus(`❌ ${t(errorI18nKey(err))} ${errorMessage(err)}`);
    } finally {
      setAiSaving(false);
    }
  };

  const testAiConnection = async () => {
    setAiTesting(true);
    setAiStatus("");
    try {
      // Persist current form values first so the test uses what is on screen.
      await invoke("update_ai_settings", { settings: aiCfg() });
      const result = await invoke("test_ai_connection");
      setAiStatus(`✅ ${result}`);
    } catch (err) {
      setAiStatus(`❌ ${t(errorI18nKey(err))} ${errorMessage(err)}`);
    } finally {
      setAiTesting(false);
    }
  };

  return (
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-semibold mb-3 md:mb-4">{t("settings.ai.title")}</h3>
        <p class="text-sm text-gray-400 mb-4">{t("settings.ai.description")}</p>

        <div class="bg-[#1a1a1a] rounded-lg p-6 space-y-4">
          {/* Enable toggle */}
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-sm text-gray-300">{t("settings.ai.enable")}</span>
            <input
              type="checkbox"
              checked={aiCfg().enabled}
              onChange={(e) => setAiCfg({ ...aiCfg(), enabled: e.currentTarget.checked })}
              class="w-5 h-5 accent-blue-600"
            />
          </label>

          {/* Base URL */}
          <div class="flex flex-col gap-1">
            <label class="text-sm text-gray-400">{t("settings.ai.baseUrl")}</label>
            <input
              type="url"
              value={aiCfg().base_url}
              onInput={(e) => setAiCfg({ ...aiCfg(), base_url: e.currentTarget.value })}
              class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors font-mono text-sm"
              placeholder="http://localhost:11434/v1"
            />
          </div>

          {/* API key */}
          <div class="flex flex-col gap-1">
            <label class="text-sm text-gray-400">{t("settings.ai.apiKey")}</label>
            <input
              type="password"
              value={aiCfg().api_key}
              onInput={(e) => setAiCfg({ ...aiCfg(), api_key: e.currentTarget.value })}
              class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors font-mono text-sm"
              placeholder="••••••••••••"
            />
            <span class="text-xs text-gray-500">{t("settings.ai.apiKeyHint")}</span>
          </div>
  <div class="flex flex-col gap-1">
    <label class="text-sm text-gray-400">{t("settings.ai.availableModels")}</label>
    <select
      value={aiCfg().model}
      onChange={(e) => setAiCfg({ ...aiCfg(), model: e.currentTarget.value })}
      class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors font-mono text-sm"
    >
      <option value="" disabled selected>{t("settings.ai.selectModel")}</option>
      <For each={availableModels()}>
{(model) => (
  <option value={model} selected={model === aiCfg().model}>
    {model}
  </option>
)}
      </For>
    </select>
  </div>



          {/* System prompt */}
          <div class="flex flex-col gap-1">
            <label class="text-sm text-gray-400">{t("settings.ai.systemPrompt")}</label>
            <textarea
              rows={3}
              value={aiCfg().system_prompt}
              onInput={(e) => setAiCfg({ ...aiCfg(), system_prompt: e.currentTarget.value })}
              class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors text-sm resize-y"
              placeholder={t("settings.ai.systemPromptPlaceholder")}
            />
          </div>

          {/* Status */}
          <Show when={aiStatus()}>
            <div class={`text-sm text-center mt-2 ${aiStatus().startsWith("❌") ? "text-red-400" : "text-green-400"}`}>
              {aiStatus()}
            </div>
          </Show>

          {/* Actions */}
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              onClick={saveAiSettings}
              disabled={aiSaving()}
              class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all active:scale-95"
            >
              {aiSaving() ? t("settings.saving") : t("settings.saveConfig")}
            </button>
            <button
              type="button"
              onClick={testAiConnection}
              disabled={aiTesting()}
              class="flex-1 bg-[#2a2a2a] hover:bg-[#333333] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all active:scale-95"
            >
              {aiTesting() ? t("settings.ai.testing") : t("settings.ai.test")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
