import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "../../lib/ipc";
import { useI18n } from "../../i18n/I18nProvider";
import { errorMessage } from "../../lib/errors";
import { IS_MOBILE } from "../../lib/platform";

const DEFAULT_SETTINGS = {
  smtp_host: "",
  smtp_port: 587,
  smtp_security: "startTls",
  smtp_username: "",
  smtp_from_email: "",
  smtp_from_name: "VisualTalk",
  twilio_account_sid: "",
  twilio_from_phone: "",
};

export function MessagingSection() {
  const { t } = useI18n();
  const [settings, setSettings] = createSignal(DEFAULT_SETTINGS);
  const [smtpPassword, setSmtpPassword] = createSignal("");
  const [twilioAuthToken, setTwilioAuthToken] = createSignal("");
  const [smtpPasswordConfigured, setSmtpPasswordConfigured] = createSignal(false);
  const [twilioAuthTokenConfigured, setTwilioAuthTokenConfigured] = createSignal(false);
  const [clearSmtpPassword, setClearSmtpPassword] = createSignal(false);
  const [clearTwilioAuthToken, setClearTwilioAuthToken] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  onMount(async () => {
    try {
      const saved = await invoke("get_messaging_settings");
      setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
      setSmtpPasswordConfigured(saved.smtp_password_configured);
      setTwilioAuthTokenConfigured(saved.twilio_auth_token_configured);
    } catch (error) {
      console.error("Failed to load messaging settings:", error);
      setStatus(`❌ ${errorMessage(error)}`);
    }
  });

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const saved = await invoke("update_messaging_settings", {
        settings: settings(),
        smtpPassword: smtpPassword(),
        clearSmtpPassword: clearSmtpPassword(),
        twilioAuthToken: twilioAuthToken(),
        clearTwilioAuthToken: clearTwilioAuthToken(),
      });
      setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
      setSmtpPassword("");
      setTwilioAuthToken("");
      setClearSmtpPassword(false);
      setClearTwilioAuthToken(false);
      setSmtpPasswordConfigured(saved.smtp_password_configured);
      setTwilioAuthTokenConfigured(saved.twilio_auth_token_configured);
      setStatus(`✅ ${t("settings.messaging.saved")}`);
    } catch (error) {
      console.error("Failed to save messaging settings:", error);
      setStatus(`❌ ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key, value) =>
    setSettings({ ...settings(), [key]: value });

  return (
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-semibold mb-3 md:mb-4">{t("settings.messaging.title")}</h3>
        <p class="text-sm text-gray-400 mb-4">{t("settings.messaging.description")}</p>

        <form onSubmit={saveSettings} class="space-y-5">
          <section class="bg-[#1a1a1a] rounded-lg p-5 space-y-4">
            <div>
              <h4 class="font-medium">{t("settings.messaging.smtpTitle")}</h4>
              <p class="text-xs text-gray-500 mt-1">{t("settings.messaging.smtpHint")}</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.smtpHost")}
                <input
                  type="text"
                  autoComplete="url"
                  value={settings().smtp_host}
                  onInput={(event) => updateSetting("smtp_host", event.currentTarget.value)}
                  placeholder="smtp.example.com"
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500"
                />
              </label>
              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.smtpPort")}
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={settings().smtp_port}
                  onInput={(event) => updateSetting("smtp_port", Number(event.currentTarget.value))}
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500"
                />
              </label>
              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.smtpSecurity")}
                <select
                  value={settings().smtp_security}
                  onChange={(event) => updateSetting("smtp_security", event.currentTarget.value)}
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500"
                >
                  <option value="startTls">{t("settings.messaging.startTls")}</option>
                  <option value="tls">{t("settings.messaging.implicitTls")}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.smtpUsername")}
                <input
                  type="text"
                  autoComplete="username"
                  value={settings().smtp_username}
                  onInput={(event) => updateSetting("smtp_username", event.currentTarget.value)}
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500"
                />
              </label>
              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.senderName")}
                <input
                  type="text"
                  value={settings().smtp_from_name}
                  onInput={(event) => updateSetting("smtp_from_name", event.currentTarget.value)}
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500"
                />
              </label>
              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.senderEmail")}
                <input
                  type="email"
                  autoComplete="email"
                  value={settings().smtp_from_email}
                  onInput={(event) => updateSetting("smtp_from_email", event.currentTarget.value)}
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500"
                />
              </label>
              <label class="flex flex-col gap-1 text-sm text-gray-400 sm:col-span-2">
                {t("settings.messaging.smtpPassword")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={smtpPassword()}
                  onInput={(event) => setSmtpPassword(event.currentTarget.value)}
                  placeholder={smtpPasswordConfigured() ? t("settings.messaging.secretSaved") : ""}
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500"
                />
                <Show when={smtpPasswordConfigured()}>
                  <span class="flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={clearSmtpPassword()}
                      onChange={(event) => setClearSmtpPassword(event.currentTarget.checked)}
                    />
                    {t("settings.messaging.clearSavedSecret")}
                  </span>
                </Show>
              </label>
            </div>
          </section>

          <Show when={IS_MOBILE}>
            <section class="bg-[#1a1a1a] rounded-lg p-5 space-y-4">
              <div>
                <h4 class="font-medium">{t("settings.messaging.smsTitle")}</h4>
                <p class="text-xs text-gray-500 mt-1">{t("settings.messaging.smsHint")}</p>
              </div>

              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.twilioAccountSid")}
                <input
                  type="text"
                  autoComplete="off"
                  value={settings().twilio_account_sid}
                  onInput={(event) => updateSetting("twilio_account_sid", event.currentTarget.value)}
                  placeholder="AC..."
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 font-mono text-white outline-none focus:border-blue-500"
                />
              </label>

              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.twilioFromPhone")}
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={settings().twilio_from_phone}
                  onInput={(event) => updateSetting("twilio_from_phone", event.currentTarget.value)}
                  placeholder="+14155550100"
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 font-mono text-white outline-none focus:border-blue-500"
                />
              </label>

              <label class="flex flex-col gap-1 text-sm text-gray-400">
                {t("settings.messaging.twilioAuthToken")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={twilioAuthToken()}
                  onInput={(event) => setTwilioAuthToken(event.currentTarget.value)}
                  placeholder={twilioAuthTokenConfigured() ? t("settings.messaging.secretSaved") : ""}
                  class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 font-mono text-white outline-none focus:border-blue-500"
                />
                <Show when={twilioAuthTokenConfigured()}>
                  <span class="flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={clearTwilioAuthToken()}
                      onChange={(event) => setClearTwilioAuthToken(event.currentTarget.checked)}
                    />
                    {t("settings.messaging.clearSavedSecret")}
                  </span>
                </Show>
              </label>
            </section>
          </Show>

          <Show when={status()}>
            <p role="status" class={`text-sm ${status().startsWith("❌") ? "text-red-400" : "text-green-400"}`}>
              {status()}
            </p>
          </Show>

          <button
            type="submit"
            disabled={saving()}
            class="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all"
          >
            {saving() ? t("settings.saving") : t("settings.saveConfig")}
          </button>
        </form>
      </div>
    </div>
  );
}
