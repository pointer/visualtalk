import { createSignal, onMount, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';

export default function Settings() {
    const [url, setUrl] = createSignal('');
    const [apiKey, setApiKey] = createSignal('');
    const [apiSecret, setApiSecret] = createSignal('');
    const [identity, setIdentity] = createSignal('');
    const [status, setStatus] = createSignal('');
    const [loading, setLoading] = createSignal(false);

    // Load existing settings when component mounts
    onMount(async () => {
        try {
            const settings = await invoke('load_settings');
            if (settings) {
                setUrl(settings.url);
                setApiKey(settings.api_key);
                setApiSecret(settings.api_secret);
                setIdentity(settings.identity);
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    });

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
            setStatus('✅ Settings saved securely!');

            // Clear status message after 3 seconds
            setTimeout(() => setStatus(''), 3000);
        } catch (err) {
            setStatus(`❌ Error: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="min-h-screen bg-[#0f0f0f] text-white p-6 pt-[3rem] sm:pt-6 flex flex-col items-center">
            <div class="w-full max-w-md bg-[#1c1c1c] rounded-2xl p-6 shadow-xl border border-[#2a2a2a]">
                <h2 class="text-2xl font-bold mb-6 text-center">LiveKit Settings</h2>

                <form onSubmit={handleSave} class="flex flex-col gap-4">
                    {/* Identity / Display Name */}
                    <div class="flex flex-col gap-1">
                        <label class="text-sm text-gray-400">Your Identity / Name</label>
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
                        <label class="text-sm text-gray-400">LiveKit Server URL</label>
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
                        <label class="text-sm text-gray-400">API Key</label>
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
                        <label class="text-sm text-gray-400">API Secret</label>
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
                        {loading() ? 'Saving...' : 'Save Configuration'}
                    </button>
                </form>
            </div>
        </div>
    );
}