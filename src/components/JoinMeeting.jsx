import { createSignal, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';

export default function JoinMeetingModal({ onClose, onJoinSuccess }) {
    const [step, setStep] = createSignal('paste'); // 'paste' or 'details'
    const [inviteLink, setInviteLink] = createSignal('');
    const [parsedData, setParsedData] = createSignal(null);
    const [guestName, setGuestName] = createSignal('');
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal('');

    // Step 1: Parse the link using Rust
    const handleParseLink = async () => {
        if (!inviteLink().trim()) return;

        setLoading(true);
        setError('');

        try {
            // Call Rust to safely parse the visualtalk:// URL
            const data = await invoke('parse_invite_link', { inviteLink: inviteLink().trim() });
            setParsedData(data);
            setStep('details'); // Move to next step
        } catch (err) {
            setError(err.toString().replace('Error: ', ''));
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Final Join Action
    const handleFinalJoin = () => {
        if (!guestName().trim()) {
            setError("Please enter your name to join.");
            return;
        }

        const data = parsedData();
        if (!data) return;

        // Pass the clean data up to the parent component (MainWindow)
        // The parent will handle opening the actual meeting window
        onJoinSuccess({
            url: data.url,
            token: data.token,
            room: data.room,
            identity: guestName().trim()
        });

        onClose();
    };

    return (
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div class="bg-[#1c1c1c] w-full max-w-md rounded-2xl border border-[#2a2a2a] shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div class="flex justify-between items-center p-5 border-b border-[#2a2a2a]">
                    <h2 class="text-xl font-bold text-white">Join Meeting</h2>
                    <button onClick={onClose} class="text-gray-400 hover:text-white transition-colors">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div class="p-6 flex flex-col gap-5 min-h-[200px]">

                    <Show when={step() === 'paste'}>
                        {/* === STEP 1: PASTE LINK === */}
                        <div class="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <label class="text-sm text-gray-400 font-medium">Paste Invite Link</label>
                            <textarea
                                value={inviteLink()}
                                onInput={(e) => setInviteLink(e.currentTarget.value)}
                                class="w-full h-24 bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-3 text-sm text-gray-200 font-mono outline-none focus:border-blue-500 transition-colors resize-none"
                                placeholder="visualtalk://join?room=..."
                                autofocus
                            />

                            <Show when={error()}>
                                <p class="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{error()}</p>
                            </Show>
                        </div>
                    </Show>

                    <Show when={step() === 'details'}>
                        {/* === STEP 2: ENTER NAME & CONFIRM === */}
                        <div class="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div class="bg-[#0f0f0f] p-4 rounded-xl border border-[#2a2a2a] flex flex-col gap-1">
                                <span class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Room</span>
                                <span class="text-white font-mono text-lg">{parsedData()?.room}</span>
                            </div>

                            <div class="flex flex-col gap-2 mt-2">
                                <label class="text-sm text-gray-400 font-medium">Your Display Name</label>
                                <input
                                    type="text"
                                    value={guestName()}
                                    onInput={(e) => setGuestName(e.currentTarget.value)}
                                    class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-3 text-white outline-none focus:border-blue-500 transition-colors"
                                    placeholder="e.g. Jane Doe"
                                    autofocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleFinalJoin()}
                                />
                            </div>

                            <Show when={error()}>
                                <p class="text-xs text-red-400">{error()}</p>
                            </Show>
                        </div>
                    </Show>

                </div>

                {/* Footer */}
                <div class="p-5 border-t border-[#2a2a2a] flex justify-end gap-3 bg-[#151515]">
                    <button onClick={onClose} class="px-5 py-2.5 rounded-xl text-gray-300 hover:bg-[#2a2a2a] transition-colors font-medium">
                        Cancel
                    </button>

                    <Show when={step() === 'paste'}>
                        <button
                            onClick={handleParseLink}
                            disabled={loading() || !inviteLink().trim()}
                            class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition-all active:scale-95"
                        >
                            {loading() ? 'Validating...' : 'Continue'}
                        </button>
                    </Show>

                    <Show when={step() === 'details'}>
                        <button
                            onClick={() => setStep('paste')}
                            class="px-5 py-2.5 rounded-xl text-gray-300 hover:bg-[#2a2a2a] transition-colors font-medium"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleFinalJoin}
                            disabled={!guestName().trim()}
                            class="px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold transition-all active:scale-95"
                        >
                            Join Now
                        </button>
                    </Show>
                </div>

            </div>
        </div>
    );
}