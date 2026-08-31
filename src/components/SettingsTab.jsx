import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export function SettingsTab(props) {
  const [activeSection, setActiveSection] = createSignal("audio-video");
  const [loading, setLoading] = createSignal(true);
  
  // Audio/Video Settings
  const [audioInputs, setAudioInputs] = createSignal([]);
  const [videoInputs, setVideoInputs] = createSignal([]);
  const [audioOutputs, setAudioOutputs] = createSignal([]);
  
  const [selectedMic, setSelectedMic] = createSignal("");
  const [selectedCamera, setSelectedCamera] = createSignal("");
  const [selectedSpeaker, setSelectedSpeaker] = createSignal("");
  
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

  // Load all settings on mount
  onMount(async () => {
    try {
      setLoading(true);
      
      // Load devices
      const mics = await invoke("get_audio_inputs");
      const cameras = await invoke("get_video_inputs");
      const speakers = await invoke("get_audio_outputs");
      
      setAudioInputs(mics);
      setVideoInputs(cameras);
      setAudioOutputs(speakers);
      
      // Set defaults from first devices
      if (mics.length > 0) setSelectedMic(mics[0].id);
      if (cameras.length > 0) setSelectedCamera(cameras[0].id);
      if (speakers.length > 0) setSelectedSpeaker(speakers[0].id);
      
      // Load profile and settings
      const prof = await invoke("get_user_profile");
      setProfile(prof);
      
      const sett = await invoke("get_user_settings");
      setSettings(sett);
      
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
      alert("Device preferences saved!");
    } catch (err) {
      console.error("Failed to save device preferences:", err);
      alert("Failed to save device preferences");
    }
  };

  // Update profile
  const updateProfile = async () => {
    try {
      await invoke("update_user_profile", { profile: profile() });
      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert("Failed to update profile");
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

  return (
    <div class="w-full h-full bg-[#111111] text-white overflow-hidden flex">
      {/* Sidebar Navigation */}
      <aside class="w-56 border-r border-gray-800/40 bg-[#1a1a1a] overflow-y-auto shrink-0">
        <div class="p-4">
          <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            Settings
          </h2>
          
          <nav class="space-y-1">
            {[
              { id: "audio-video", label: "Audio & Video", icon: "🎤" },
              { id: "meeting", label: "Meeting", icon: "📹" },
              { id: "profile", label: "Profile", icon: "👤" },
              { id: "about", label: "About", icon: "ℹ️" },
            ].map((section) => (
              <button
                onClick={() => setActiveSection(section.id)}
                class={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
                  activeSection() === section.id
                    ? "bg-blue-600/20 text-blue-400 border-l-2 border-blue-600"
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
        <div class="max-w-3xl mx-auto p-6 space-y-6">
          {/* Audio & Video Settings */}
          <Show when={activeSection() === "audio-video"}>
            <div class="space-y-6">
              <div>
                <h3 class="text-lg font-semibold mb-4">Audio & Video</h3>
                
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
                <h3 class="text-lg font-semibold mb-4">Meeting Preferences</h3>
                
                <div class="space-y-3">
                  {/* Start with Video */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p class="font-medium">Start with video</p>
                      <p class="text-sm text-gray-400">Enable camera when joining meetings</p>
                    </div>
                    <button
                      onClick={() => toggleSetting("start_with_video")}
                      class={`relative w-12 h-7 rounded-full transition ${
                        settings().start_with_video
                          ? "bg-blue-600"
                          : "bg-gray-700"
                      }`}
                    >
                      <div
                        class={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                          settings().start_with_video ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Use PMI */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p class="font-medium">Use Personal Meeting ID</p>
                      <p class="text-sm text-gray-400">Always use your PMI for meetings</p>
                    </div>
                    <button
                      onClick={() => toggleSetting("use_pmi")}
                      class={`relative w-12 h-7 rounded-full transition ${
                        settings().use_pmi
                          ? "bg-blue-600"
                          : "bg-gray-700"
                      }`}
                    >
                      <div
                        class={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                          settings().use_pmi ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Mute on Join */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p class="font-medium">Mute on join</p>
                      <p class="text-sm text-gray-400">Start meetings with microphone muted</p>
                    </div>
                    <button
                      onClick={() => toggleSetting("mute_on_join")}
                      class={`relative w-12 h-7 rounded-full transition ${
                        settings().mute_on_join
                          ? "bg-blue-600"
                          : "bg-gray-700"
                      }`}
                    >
                      <div
                        class={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                          settings().mute_on_join ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Always Show Preview */}
                  <div class="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p class="font-medium">Show preview before joining</p>
                      <p class="text-sm text-gray-400">Display camera preview before meeting starts</p>
                    </div>
                    <button
                      onClick={() => toggleSetting("always_show_preview")}
                      class={`relative w-12 h-7 rounded-full transition ${
                        settings().always_show_preview
                          ? "bg-blue-600"
                          : "bg-gray-700"
                      }`}
                    >
                      <div
                        class={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                          settings().always_show_preview ? "left-6" : "left-1"
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
                <h3 class="text-lg font-semibold mb-4">Profile Settings</h3>
                
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

          {/* About */}
          <Show when={activeSection() === "about"}>
            <div class="space-y-6">
              <div>
                <h3 class="text-lg font-semibold mb-4">About VisualTalk</h3>
                
                <div class="bg-[#1a1a1a] rounded-lg p-6 space-y-4">
                  <div>
                    <p class="text-sm text-gray-400">Application Version</p>
                    <p class="text-lg font-medium">1.0.0</p>
                  </div>
                  
                  <div>
                    <p class="text-sm text-gray-400">Build Date</p>
                    <p class="text-lg font-medium">August 31, 2026</p>
                  </div>
                  
                  <div>
                    <p class="text-sm text-gray-400">Platform</p>
                    <p class="text-lg font-medium">Tauri + SolidJS</p>
                  </div>

                  <div class="pt-4 border-t border-gray-700">
                    <p class="text-sm text-gray-400 mb-4">Keyboard Shortcuts</p>
                    <div class="space-y-2 text-sm">
                      <div class="flex justify-between">
                        <span class="text-gray-300">Mute/Unmute</span>
                        <span class="text-gray-500 font-mono">Cmd+M</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-300">Toggle Video</span>
                        <span class="text-gray-500 font-mono">Cmd+V</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-300">Share Screen</span>
                        <span class="text-gray-500 font-mono">Cmd+S</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-300">End Meeting</span>
                        <span class="text-gray-500 font-mono">Cmd+E</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </main>
    </div>
  );
}
