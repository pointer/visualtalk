import { useI18n } from "../i18n/I18nProvider";
import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { requestMediaPermissions } from "./Permissions";
import { LicenseScreen } from "./LicenseScreen";

export function SettingsTab(props) {
  const { t, locale, changeLocale, availableLocales } = useI18n();
  const [activeSection, setActiveSection] = createSignal("audio-video");
  const [loading, setLoading] = createSignal(true);
  const [showLicenseModal, setShowLicenseModal] = createSignal(false);

  // Audio/Video Settings
  const [audioInputs, setAudioInputs] = createSignal([]);
  const [videoInputs, setVideoInputs] = createSignal([]);
  const [audioOutputs, setAudioOutputs] = createSignal([]);
  const [deviceError, setDeviceError] = createSignal("");

  const [selectedMic, setSelectedMic] = createSignal("");
  const [selectedCamera, setSelectedCamera] = createSignal("");
  const [selectedSpeaker, setSelectedSpeaker] = createSignal("");

  // From Settings.jsx file
  const [url, setUrl] = createSignal('');
  const [apiKey, setApiKey] = createSignal('');
  const [apiSecret, setApiSecret] = createSignal('');
  const [identity, setIdentity] = createSignal('');
  const [status, setStatus] = createSignal('');
  // const [loading, setLoading] = createSignal(false);
  /////

  // Meeting Settings
  const [profile, setProfile] = createSignal({
    identity: "",
    display_name: "",
    email: "",
    pmi: "",
  });

  const [settings, setSettings] = createSignal({
    start_with_video: true,
    use_pmi: false,
    always_show_preview: true,
    mute_on_join: false,
  });

  // AI Assistant settings
  const [aiCfg, setAiCfg] = createSignal({
    enabled: false,
    base_url: "http://localhost:11434/v1",
    api_key: "",
    model: "llama3.2",
    system_prompt: "",
  });
  const [aiStatus, setAiStatus] = createSignal("");
  const [aiSaving, setAiSaving] = createSignal(false);
  const [aiTesting, setAiTesting] = createSignal(false);

  // Enumerate media devices through the webview (the only source WKWebView
  // exposes) and sync them into the Rust DeviceManager via `set_devices`, so
  // the rest of the app can use them. The Rust side cannot enumerate hardware
  // on its own — without this call the lists below stay empty forever.
  let deviceChangeListener = null;
  const loadDevicesFromBrowser = async () => {
    try {
      const status = await requestMediaPermissions();
      if (!status.camera && !status.microphone) {
        setDeviceError(
          status.message || "Camera and microphone permission is required to list devices."
        );
      } else {
        setDeviceError("");
      }

      const all = await navigator.mediaDevices.enumerateDevices();
      const toRust = (d) => ({
        id: d.deviceId,
        label: d.label || `${d.kind} (${(d.deviceId || "").slice(0, 6)})`,
        kind: d.kind,
        group_id: d.groupId || null,
      });
      const mics = all.filter((d) => d.kind === "audioinput").map(toRust);
      const cameras = all.filter((d) => d.kind === "videoinput").map(toRust);
      const speakers = all.filter((d) => d.kind === "audiooutput").map(toRust);

      setAudioInputs(mics);
      setVideoInputs(cameras);
      setAudioOutputs(speakers);

      // Keep the Rust DeviceManager in sync (preferred devices etc.).
      try {
        await invoke("set_devices", { devices: [...mics, ...cameras, ...speakers] });
      } catch (err) {
        console.warn("Rust device sync failed:", err);
      }

      // Preselect the saved preferred device, else the first one.
      try {
        const [pm, pc, ps] = await Promise.all([
          invoke("get_preferred_mic"),
          invoke("get_preferred_camera"),
          invoke("get_preferred_speaker"),
        ]);
        setSelectedMic(pm && pm.id ? pm.id : mics.length > 0 ? mics[0].id : "");
        setSelectedCamera(pc && pc.id ? pc.id : cameras.length > 0 ? cameras[0].id : "");
        setSelectedSpeaker(ps && ps.id ? ps.id : speakers.length > 0 ? speakers[0].id : "");
      } catch {
        if (mics.length > 0) setSelectedMic(mics[0].id);
        if (cameras.length > 0) setSelectedCamera(cameras[0].id);
        if (speakers.length > 0) setSelectedSpeaker(speakers[0].id);
      }

      // Refresh automatically when devices are plugged/unplugged.
      if (!deviceChangeListener && navigator.mediaDevices?.addEventListener) {
        deviceChangeListener = () => loadDevicesFromBrowser();
        navigator.mediaDevices.addEventListener("devicechange", deviceChangeListener);
      }
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
      setDeviceError(`Failed to enumerate devices: ${err && err.message ? err.message : err}`);
    }
  };

  onCleanup(() => {
    if (deviceChangeListener && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener("devicechange", deviceChangeListener);
      deviceChangeListener = null;
    }
  });

  // Load all settings on mount
  onMount(async () => {
    try {
      setLoading(true);

      const settings = await invoke('load_settings');
      if (settings) {
        setUrl(settings.url);
        setApiKey(settings.api_key);
        setApiSecret(settings.api_secret);
        setIdentity(settings.identity);
      }

      // Load devices via the browser API + sync into Rust.
      await loadDevicesFromBrowser();

      // Load profile and settings
      const prof = await invoke("get_user_profile");
      setProfile(prof);

      const sett = await invoke("get_user_settings");
      setSettings(sett);

      const ai = await invoke("get_ai_settings").catch(() => null);
      if (ai) setAiCfg(ai);

    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  });

  // Save device preferences
  const saveDevicePreferences = async () => {
    try {
      await invoke("set_device_preferences", {
        preferences: {
          preferred_mic_id: selectedMic(),
          preferred_camera_id: selectedCamera(),
          preferred_speaker_id: selectedSpeaker(),
        },
      });
      alert(t("settings.devicePrefsSaved"));
    } catch (err) {
      console.error("Failed to save device preferences:", err);
      alert(t("settings.devicePrefsFailed"));
    }
  };

  // Update profile
  const updateProfile = async () => {
    try {
      await invoke("update_user_profile", { profile: profile() });
      alert(t("settings.profileUpdated"));
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert(t("settings.profileFailed"));
    }
  };

  // Update settings
  const updateSettings = async () => {
    try {
      await invoke("update_user_settings", { settings: settings() });
      alert("Settings updated successfully!");
    } catch (err) {
      console.error("Failed to update settings:", err);
      alert("Failed to update settings");
    }
  };

  const toggleSetting = (key) => {
    setSettings({ ...settings(), [key]: !settings()[key] });
  };

  // ── AI Assistant ──
  const saveAiSettings = async () => {
    setAiSaving(true);
    setAiStatus("");
    try {
      await invoke("update_ai_settings", { settings: aiCfg() });
      setAiStatus(`✅ ${t("settings.savedSecurely")}`);
      setTimeout(() => setAiStatus(""), 3000);
    } catch (err) {
      setAiStatus(`❌ Error: ${err}`);
    } finally {
      setAiSaving(false);
    }
  };

  const testAiConnection = async () => {
    setAiTesting(true);
    setAiStatus("");
    try {
      // Persist current form values first so the test uses what's on screen.
      await invoke("update_ai_settings", { settings: aiCfg() });
      const result = await invoke("test_ai_connection");
      setAiStatus(`✅ ${result}`);
    } catch (err) {
      setAiStatus(`❌ Error: ${err}`);
    } finally {
      setAiTesting(false);
    }
  };

  // Refs for the section nav buttons, used to keep the active tab visible
  // inside the horizontally scrollable strip on small screens.
  const sectionNavRefs = {};
  const selectSection = (id) => {
    setActiveSection(id);
    if (window.innerWidth < 768) {
      const el = sectionNavRefs[id];
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');

    try {
      await invoke('save_settings', {
        settings: {
          url: url(),
          api_key: apiKey(),
          api_secret: apiSecret(),
          identity: identity(),
        },
      });
      setStatus(`✅ ${t("settings.savedSecurely")}`);

      // Clear status message after 3 seconds
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      setStatus(`❌ Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="w-full h-full bg-[#111111] text-white overflow-hidden flex flex-col md:flex-row">
      {/* Sidebar Navigation: vertical sidebar on desktop, horizontal tab strip on mobile */}
      <aside class="shrink-0 w-full md:w-56 border-b md:border-b-0 md:border-r border-gray-800/40 bg-[#1a1a1a] md:overflow-y-auto">
        <div class="p-2 md:p-4">
          <h2 class="hidden md:block text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            Settings
          </h2>

          <nav class="flex md:flex-col gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: "audio-video", label: "Audio & Video", icon: "🎤" },
              { id: "meeting", label: "Meeting", icon: "📹" },
              { id: "profile", label: "Profile", icon: "👤" },
              { id: "livekit", label: "LiveKit", icon: "⏚" },
              { id: "ai", label: "AI Assistant", icon: "✨" },
              { id: "about", label: "About", icon: "ℹ️" },
            ].map((section) => (
              <button
                ref={(el) => (sectionNavRefs[section.id] = el)}
                onClick={() => selectSection(section.id)}
                class={`shrink-0 whitespace-nowrap flex items-center gap-2 md:gap-3 px-3 py-2 md:w-full md:px-4 md:py-3 rounded-lg text-sm font-medium transition ${activeSection() === section.id
                  ? "bg-blue-600/20 text-blue-400 md:border-l-2 md:border-blue-600"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/40"
                  }`}
              >
                <span>{section.icon}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Settings Content */}
      <main class="flex-1 overflow-y-auto">
        <div class="max-w-3xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
          {/* Audio & Video Settings */}
          <Show when={activeSection() === "audio-video"}>
            <div class="space-y-6">
              <div>
                <h3 class="text-lg font-semibold mb-3 md:mb-4">Audio & Video</h3>

                <Show when={deviceError()}>
                  <div class="mb-4 bg-red-950/60 border border-red-800/60 text-red-200 text-xs rounded-lg px-3 py-2.5 flex items-start justify-between gap-2">
                    <span class="flex-1 leading-5">{deviceError()}</span>
                    <button
                      onClick={() => loadDevicesFromBrowser()}
                      class="shrink-0 underline hover:text-white"
                    >
                      Retry
                    </button>
                  </div>
                </Show>

                {/* Microphone Selection */}
                <div class="bg-[#1a1a1a] rounded-lg p-4 mb-4">
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    📋 Microphone
                  </label>
                  <Show when={audioInputs().length > 0} fallback={<p class="text-gray-500">No microphones found</p>}>
                    <select
                      value={selectedMic()}
                      onChange={(e) => setSelectedMic(e.target.value)}
                      class="w-full bg-[#2a2a2a] text-white px-4 py-2 rounded border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-blue-600 transition"
                    >
                      <For each={audioInputs()}>
                        {(mic) => <option value={mic.id}>{mic.label}</option>}
                      </For>
                    </select>
                  </Show>
                </div>

                {/* Camera Selection */}
                <div class="bg-[#1a1a1a] rounded-lg p-4 mb-4">
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    📷 Camera
                  </label>
                  <Show when={videoInputs().length > 0} fallback={<p class="text-gray-500">No cameras found</p>}>
                    <select
                      value={selectedCamera()}
                      onChange={(e) => setSelectedCamera(e.target.value)}
                      class="w-full bg-[#2a2a2a] text-white px-4 py-2 rounded border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-blue-600 transition"
                    >
                      <For each={videoInputs()}>
                        {(cam) => <option value={cam.id}>{cam.label}</option>}
                      </For>
                    </select>
                  </Show>
                </div>

                {/* Speaker Selection */}
                <div class="bg-[#1a1a1a] rounded-lg p-4 mb-4">
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    🔊 Speaker
                  </label>
                  <Show when={audioOutputs().length > 0} fallback={<p class="text-gray-500">No speakers found</p>}>
                    <select
                      value={selectedSpeaker()}
                      onChange={(e) => setSelectedSpeaker(e.target.value)}
                      class="w-full bg-[#2a2a2a] text-white px-4 py-2 rounded border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-blue-600 transition"
                    >
                      <For each={audioOutputs()}>
                        {(speaker) => <option value={speaker.id}>{speaker.label}</option>}
                      </For>
                    </select>
                  </Show>
                </div>

                <button
                  onClick={saveDevicePreferences}
                  class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
                >
                  Save Device Preferences
                </button>
              </div>
            </div>
          </Show>

          {/* Meeting Settings */}
          <Show when={activeSection() === "meeting"}>
            <div class="space-y-6">
              <div>
                <h3 class="text-lg font-semibold mb-3 md:mb-4">Meeting Preferences</h3>

                <div class="space-y-3">
                  {/* Start with Video */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium">Start with video</p>
                      <p class="text-sm text-gray-400">Enable camera when joining meetings</p>
                    </div>
                    <button
                      onClick={() => toggleSetting("start_with_video")}
                      class={`relative shrink-0 w-12 h-7 rounded-full transition ${settings().start_with_video
                        ? "bg-blue-600"
                        : "bg-gray-700"
                        }`}
                    >
                      <div
                        class={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${settings().start_with_video ? "left-6" : "left-1"
                          }`}
                      />
                    </button>
                  </div>

                  {/* Use PMI */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium">Use Personal Meeting ID</p>
                      <p class="text-sm text-gray-400">Always use your PMI for meetings</p>
                    </div>
                    <button
                      onClick={() => toggleSetting("use_pmi")}
                      class={`relative shrink-0 w-12 h-7 rounded-full transition ${settings().use_pmi
                        ? "bg-blue-600"
                        : "bg-gray-700"
                        }`}
                    >
                      <div
                        class={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${settings().use_pmi ? "left-6" : "left-1"
                          }`}
                      />
                    </button>
                  </div>

                  {/* Mute on Join */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium">Mute on join</p>
                      <p class="text-sm text-gray-400">Start meetings with microphone muted</p>
                    </div>
                    <button
                      onClick={() => toggleSetting("mute_on_join")}
                      class={`relative shrink-0 w-12 h-7 rounded-full transition ${settings().mute_on_join
                        ? "bg-blue-600"
                        : "bg-gray-700"
                        }`}
                    >
                      <div
                        class={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${settings().mute_on_join ? "left-6" : "left-1"
                          }`}
                      />
                    </button>
                  </div>

                  {/* Always Show Preview */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium">Show preview before joining</p>
                      <p class="text-sm text-gray-400">Display camera preview before meeting starts</p>
                    </div>
                    <button
                      onClick={() => toggleSetting("always_show_preview")}
                      class={`relative shrink-0 w-12 h-7 rounded-full transition ${settings().always_show_preview
                        ? "bg-blue-600"
                        : "bg-gray-700"
                        }`}
                    >
                      <div
                        class={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${settings().always_show_preview ? "left-6" : "left-1"
                          }`}
                      />
                    </button>
                  </div>
                </div>

                <button
                  onClick={updateSettings}
                  class="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
                >
                  Save Meeting Preferences
                </button>
              </div>
            </div>
          </Show>

          {/* Profile Settings */}
          <Show when={activeSection() === "profile"}>
            <div class="space-y-6">
              <div>
                <h3 class="text-lg font-semibold mb-3 md:mb-4">Profile Settings</h3>

                <div class="space-y-4">
                  {/* Display Name */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4">
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={profile().display_name}
                      onInput={(e) =>
                        setProfile({ ...profile(), display_name: e.target.value })
                      }
                      class="w-full bg-[#2a2a2a] text-white px-4 py-2 rounded border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-blue-600 transition"
                      placeholder="Enter your display name"
                    />
                  </div>

                  {/* Email */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4">
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={profile().email}
                      onInput={(e) =>
                        setProfile({ ...profile(), email: e.target.value })
                      }
                      class="w-full bg-[#2a2a2a] text-white px-4 py-2 rounded border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-blue-600 transition"
                      placeholder="Enter your email"
                    />
                  </div>

                  {/* PMI */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4">
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                      Personal Meeting ID
                    </label>
                    <input
                      type="text"
                      value={profile().pmi}
                      onInput={(e) =>
                        setProfile({ ...profile(), pmi: e.target.value })
                      }
                      class="w-full bg-[#2a2a2a] text-white px-4 py-2 rounded border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-blue-600 transition"
                      placeholder="Enter your PMI"
                    />
                  </div>

                  {/* Identity */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4">
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                      Username/Identity
                    </label>
                    <input
                      type="text"
                      value={profile().identity}
                      onInput={(e) =>
                        setProfile({ ...profile(), identity: e.target.value })
                      }
                      class="w-full bg-[#2a2a2a] text-white px-4 py-2 rounded border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-blue-600 transition"
                      placeholder="Enter your username"
                    />
                  </div>
                </div>

                <button
                  onClick={updateProfile}
                  class="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </Show>

          {/* Livekit Settings */}
          <Show when={activeSection() === "livekit"}>
            <div class="w-full max-w-md bg-[#1c1c1c] rounded-2xl p-4 sm:p-6 shadow-xl border border-[#2a2a2a]">
              <h2 class="text-2xl font-bold mb-6 text-center">{t("settings.livekitSettings")}</h2>

              <form onSubmit={handleSave} class="flex flex-col gap-4">
                {/* Identity / Display Name */}
                <div class="flex flex-col gap-1">
                  <label class="text-sm text-gray-400">{t("settings.yourIdentity")}</label>
                  <input
                    type="text"
                    value={identity()}
                    onInput={(e) => setIdentity(e.currentTarget.value)}
                    class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors"
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>

                {/* LiveKit URL */}
                <div class="flex flex-col gap-1">
                  <label class="text-sm text-gray-400">{t("settings.livekitUrl")}</label>
                  <input
                    type="url"
                    value={url()}
                    onInput={(e) => setUrl(e.currentTarget.value)}
                    class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors"
                    placeholder="wss://your-project.livekit.cloud"
                    required
                  />
                </div>

                {/* API Key */}
                <div class="flex flex-col gap-1">
                  <label class="text-sm text-gray-400">{t("settings.apiKey")}</label>
                  <input
                    type="text"
                    value={apiKey()}
                    onInput={(e) => setApiKey(e.currentTarget.value)}
                    class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                    placeholder="API..."
                    required
                  />
                </div>

                {/* API Secret */}
                <div class="flex flex-col gap-1">
                  <label class="text-sm text-gray-400">{t("settings.apiSecret")}</label>
                  <input
                    type="password" // Masked for security
                    value={apiSecret()}
                    onInput={(e) => setApiSecret(e.currentTarget.value)}
                    class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                    placeholder="••••••••••••"
                    required
                  />
                </div>

                {/* Status Message */}
                <Show when={status()}>
                  <div class={`text-sm text-center mt-2 ${status().includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                    {status()}
                  </div>
                </Show>

                {/* Save Button */}
                <button
                  type="submit"
                  disabled={loading()}
                  class="mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all active:scale-95"
                >
                  {loading() ? t("settings.saving") : t("settings.saveConfig")}
                </button>
              </form>
            </div>
          </Show>

          {/* AI Assistant */}
          <Show when={activeSection() === "ai"}>
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

                  {/* Model */}
                  <div class="flex flex-col gap-1">
                    <label class="text-sm text-gray-400">{t("settings.ai.model")}</label>
                    <input
                      type="text"
                      value={aiCfg().model}
                      onInput={(e) => setAiCfg({ ...aiCfg(), model: e.currentTarget.value })}
                      class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                      placeholder="llama3.2 / gpt-4o-mini / ..."
                    />
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
          </Show>

          {/* About */}
          <Show when={activeSection() === "about"}>
            <div class="space-y-6">
              <div>
                <h3 class="text-lg font-semibold mb-3 md:mb-4">About VisualTalk</h3>

                <div class="bg-[#1a1a1a] rounded-lg p-6 space-y-4">
                  <div>
                    <p class="text-sm text-gray-400">Application Version</p>
                    <p class="text-lg font-medium">1.0.0</p>
                  </div>

                  <div>
                    <p class="text-sm text-gray-400">Build Date</p>
                    <p class="text-lg font-medium">August 31, 2024</p>
                  </div>

                  <div>
                    <p class="text-sm text-gray-400">Platform</p>
                    <p class="text-lg font-medium">Tauri + SolidJS</p>
                  </div>

                  <div class="pt-4 border-t border-gray-700">
                    <p class="text-sm text-gray-400 mb-4">{t("settings.keyboardShortcuts")}</p>
                    <div class="space-y-2 text-sm">
                      <div class="flex justify-between">
                        <span class="text-gray-300">{t("settings.shortcutMute")}</span>
                        <span class="text-gray-500 font-mono">Cmd+M</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-300">{t("settings.shortcutVideo")}</span>
                        <span class="text-gray-500 font-mono">Cmd+V</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-300">{t("settings.shortcutShare")}</span>
                        <span class="text-gray-500 font-mono">Cmd+S</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-300">{t("settings.shortcutEnd")}</span>
                        <span class="text-gray-500 font-mono">Cmd+E</span>
                      </div>
                    </div>
                  </div>

                  {/* Language Selector */}
                  <div class="space-y-2">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("settings.language")}</p>
                    <select
                      value={locale()}
                      onChange={(e) => changeLocale(e.currentTarget.value)}
                      class="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-3 text-white outline-none focus:border-blue-500 transition-colors cursor-pointer"
                    >
                      <For each={availableLocales}>
                        {(loc) => (
                          <option value={loc.code}>{loc.nativeName} ({loc.name})</option>
                        )}
                      </For>
                    </select>
                  </div>



                  {/* License Button */}
                  <div class="pt-4 border-t border-gray-700">
                    <button
                      onClick={() => setShowLicenseModal(true)}
                      class="w-full flex items-center justify-between px-4 py-3 bg-[#0f0f0f] hover:bg-[#252525] border border-[#2a2a2a] rounded-lg transition-colors"
                    >
                      <div class="flex items-center gap-3">
                        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div class="text-left">
                          <p class="text-sm font-medium text-white">{t("settings.licenseAgreement")}</p>
                          <p class="text-xs text-gray-500">{t("settings.licenseDesc")}</p>
                        </div>
                      </div>
                      <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* License Modal */}
            <Show when={showLicenseModal()}>
              <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div class="bg-[#1c1c1c] border border-[#2a2a2a] rounded-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden shadow-2xl">
                  <div class="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
                    <h2 class="text-lg font-semibold">{t("settings.licenseModalTitle")}</h2>
                    <button
                      onClick={() => setShowLicenseModal(false)}
                      class="p-1.5 hover:bg-[#2a2a2a] rounded-lg transition-colors"
                    >
                      <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div class="p-6 overflow-y-auto max-h-[calc(80vh-4rem)]">
                    <LicenseScreen version="1.0.0" />
                  </div>
                </div>
              </div>
            </Show>
          </Show>
        </div>
      </main>
    </div>
  );
}
