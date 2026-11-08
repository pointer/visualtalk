import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "../../lib/ipc";
import { useI18n } from "../../i18n/I18nProvider";

/**
 * Pro-only Live Translation settings (ADR 0003).
 *
 * Owns its state and loads `get_translation_settings` itself: nothing else in
 * Settings reads it, so the parent no longer needs an IS_PRO_EDITION branch in
 * its load path. The parent only renders this inside
 * `<Show when={IS_PRO_EDITION && activeSection() === "translation"}>`, so in a
 * Community build the component is never mounted and the invoke never happens.
 *
 * The runtime translation pipeline is not implemented yet — these settings are
 * the agreed MVP surface (see Todo.txt), and the strategy options must not imply
 * an unimplemented provider is operational.
 *
 * CURRENTLY NOT REACHABLE: `SettingsPanel` gates this component behind
 * `IS_TRANSLATION_AVAILABLE` (`src/lib/edition.js`), which is off unless the build
 * sets `VITE_ENABLE_TRANSLATION=true`. Nothing reads `translation.enabled`, so the
 * screen was a toggle that provably did nothing in a paid build. Kept intact
 * deliberately — flip the flag to bring it back once a provider produces captions.
 * Known issues to fix before re-enabling: `t("settings.savedSuccessfully")` does
 * not exist in any locale (the alert renders the raw key — use
 * `settings.savedSecurely`); every label is hardcoded English; and the target
 * language picker offers languages no provider can deliver (see
 * docs/whisper-service-contract.md §5).
 */
export function TranslationSection() {
  const { t } = useI18n();

  const [transSettings, setTransSettings] = createSignal({
    enabled: false,
    strategy: "cloud",
    sourceLanguage: "auto",
    targetLanguage: "en",
    apiKey: "",
    customUrl: "",
  });
  const [transSaving, setTransSaving] = createSignal(false);
  const [transLoadError, setTransLoadError] = createSignal("");

  onMount(async () => {
    try {
      setTransSettings(await invoke("get_translation_settings"));
    } catch (err) {
      console.error("Failed to load translation settings:", err);
      setTransLoadError(`Failed to load translation settings: ${err}`);
    }
  });

  const saveTranslationSettings = async () => {
    setTransSaving(true);
    try {
      await invoke("update_translation_settings", { settings: transSettings() });
      alert(t("settings.savedSuccessfully"));
    } catch (err) {
      alert(`❌ Error: ${err}`);
    } finally {
      setTransSaving(false);
    }
  };

  const StrategyOption = (props) => (
    <button
      onClick={() => setTransSettings({ ...transSettings(), strategy: props.value })}
      class={`px-4 py-2 rounded-lg border text-sm transition-all ${transSettings().strategy === props.value
          ? "bg-blue-600 border-blue-500 text-white"
          : "bg-[#0f0f0f] border-[#2a2a2a] text-gray-400 hover:border-gray-600"
        }`}
    >
      {props.label}
    </button>
  );

  return (
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-semibold mb-3 md:mb-4">Live Translation Settings</h3>
        <div class="bg-[#1a1a1a] rounded-lg p-6 space-y-6">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-semibold text-gray-300">Translation Strategy</label>
            <div class="flex flex-wrap gap-2">
              <StrategyOption value="cloud" label="Cloud API" />
              <StrategyOption value="docker" label="Local Docker" />
              <StrategyOption value="serverAgent" label="Server Agent" />
            </div>
            <p class="text-xs text-gray-500">Choose how translation is performed.</p>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-semibold text-gray-300">Spoken Language</label>
            <select
              value={transSettings().sourceLanguage || "auto"}
              onChange={(e) => setTransSettings({ ...transSettings(), sourceLanguage: e.currentTarget.value })}
              class="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500 transition-colors"
            >
              <option value="auto">Auto-detect</option>
              <option value="ar">Arabic</option>
              <option value="zh">Chinese</option>
              <option value="nl">Dutch</option>
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="hi">Hindi</option>
              <option value="it">Italian</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="pl">Polish</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="es">Spanish</option>
              <option value="tr">Turkish</option>
              <option value="uk">Ukrainian</option>
              <option value="vi">Vietnamese</option>
            </select>
            <p class="text-xs text-gray-500">Language spoken in the meeting. Auto-detect lets the transcription provider identify it.</p>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-semibold text-gray-300">Target Language</label>
            <select
              value={transSettings().targetLanguage}
              onChange={(e) => setTransSettings({ ...transSettings(), targetLanguage: e.currentTarget.value })}
              class="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500 transition-colors"
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="pt">Portuguese</option>
              <option value="it">Italian</option>
            </select>
          </div>

          <Show when={transSettings().strategy === "cloud"}>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-semibold text-gray-500">Cloud API Key (Required)</label>
              <input
                type="password"
                value={transSettings().apiKey || ""}
                onInput={(e) => setTransSettings({ ...transSettings(), apiKey: e.currentTarget.value })}
                class="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                placeholder="OpenAI / Gemini / Deepgram API Key"
                autocomplete="off"
              />
              <p class="text-xs text-gray-500">Your API key is stored locally and never sent to VisualTalk servers.</p>
            </div>
          </Show>

          {/* The strategy value is the *serde wire spelling*, not a display
              label: TranslationStrategy is `rename_all = "camelCase"`, so
              ServerAgent arrives as "serverAgent". Pinned by the Rust test
              `translation_strategy_wire_spelling_is_camel_case`. */}
          <Show when={transSettings().strategy === "docker" || transSettings().strategy === "serverAgent"}>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-semibold text-gray-500">Custom Server URL (Optional)</label>
              <input
                type="url"
                value={transSettings().customUrl || ""}
                onInput={(e) => setTransSettings({ ...transSettings(), customUrl: e.currentTarget.value })}
                class="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                placeholder="http://192.168.1.15:8080 or https://whisper.my-domain.com"
              />
              <p class="text-xs text-gray-500">If empty, VisualTalk will try to discover the local Docker server.</p>
            </div>
          </Show>

          <div class="flex items-center justify-between py-2 border-t border-gray-800">
            <label class="text-sm font-semibold text-gray-300">Enable Live Translation</label>
            <button
              type="button"
              onClick={() => setTransSettings({ ...transSettings(), enabled: !transSettings().enabled })}
              class={`px-4 py-1 rounded-full text-sm font-medium transition ${transSettings().enabled ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
            >
              {transSettings().enabled ? "ON" : "OFF"}
            </button>
          </div>

          <div class="pt-4 border-t border-gray-800">
            <Show when={transLoadError()}>
              <p role="alert" class="mb-3 text-sm text-red-400">{transLoadError()}</p>
            </Show>
            <button
              type="button"
              onClick={saveTranslationSettings}
              disabled={transSaving()}
              class="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all active:scale-95"
            >
              {transSaving() ? "Saving..." : "Save Translation Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
