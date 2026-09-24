import { createSignal, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager'; // Requires tauri-plugin-clipboard-manager

export default function ScheduleModal({ onClose }) {
    const [title, setTitle] = createSignal('Team Sync');
    const [loading, setLoading] = createSignal(false);
    const [inviteData, setInviteData] = createSignal(null);
    const [copied, setCopied] = createSignal(false);

    const handleSchedule = async () => {
        if (!title().trim()) return;

        setLoading(true);
        try {
            // Call Rust to generate the room and the magic link!
            const result = await invoke('create_meeting_invite', { title: title() });
            setInviteData(result);
        } catch (err) {
            alert(`Error creating meeting: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyLink = async () => {
        if (inviteData()) {
            try {
                await writeText(inviteData().invite_link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error("Failed to copy:", err);
            }
        }
    };

    return (
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div class="bg-[#1c1c1c] w-full max-w-md rounded-2xl border border-[#2a2a2a] shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div class="flex justify-between items-center p-5 border-b border-[#2a2a2a]">
                    <h2 class="text-xl font-bold text-white">
                        {inviteData() ? 'Meeting Created!' : 'Schedule Meeting'}
                    </h2>
                    <button onClick={onClose} class="text-gray-400 hover:text-white transition-colors">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div class="p-6 flex flex-col gap-5">

                    <Show when={!inviteData()} fallback={
                        // === SUCCESS STATE: Show the Invite Link ===
                        <div class="flex flex-col gap-4 animate-in fade-in zoom-in duration-300">
                            <div class="bg-[#0f0f0f] p-4 rounded-xl border border-[#2a2a2a]">
                                <p class="text-sm text-gray-400 mb-1">Meeting Title</p>
                                <p class="text-white font-semibold text-lg">{inviteData().title}</p>
                            </div>

                            <div class="bg-[#0f0f0f] p-4 rounded-xl border border-[#2a2a2a]">
                                <p class="text-sm text-gray-400 mb-1">Room Code</p>
                                <p class="text-white font-mono text-lg">{inviteData().room}</p>
                            </div>

                            <div class="flex flex-col gap-2 mt-2">
                                <label class="text-sm text-gray-400">Share this Invite Link:</label>
                                <div class="flex gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={inviteData().invite_link}
                                        class="flex-1 bg-[#2a2a2a] text-gray-300 text-xs font-mono rounded-lg p-3 outline-none truncate"
                                    />
                                    <button
                                        onClick={handleCopyLink}
                                        class={`px-4 rounded-lg font-semibold transition-all active:scale-95 ${copied() ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                    >
                                        {copied() ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">Anyone with this link can join within the next 24 hours.</p>
                            </div>
                        </div>
                    }>
                        {/* === FORM STATE: Collect Title === */}
                        <div class="flex flex-col gap-2">
                            <label class="text-sm text-gray-400">Meeting Title</label>
                            <input
                                type="text"
                                value={title()}
                                onInput={(e) => setTitle(e.currentTarget.value)}
                                class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-3 text-white outline-none focus:border-blue-500 transition-colors"
                                placeholder="e.g. Team Sync"
                                autofocus
                            />
                        </div>

                        {/* We removed Room Code, Token, Date/Time for now to focus on the core LiveKit connection. 
                We can add Date/Time back later as pure metadata! */}
                    </Show>

                </div>

                {/* Footer */}
                <div class="p-5 border-t border-[#2a2a2a] flex justify-end gap-3 bg-[#151515]">
                    <Show when={!inviteData()}>
                        <button onClick={onClose} class="px-5 py-2.5 rounded-xl text-gray-300 hover:bg-[#2a2a2a] transition-colors font-medium">
                            Cancel
                        </button>
                        <button
                            onClick={handleSchedule}
                            disabled={loading() || !title().trim()}
                            class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition-all active:scale-95"
                        >
                            {loading() ? 'Generating...' : 'Schedule'}
                        </button>
                    </Show>

                    <Show when={inviteData()}>
                        <button onClick={onClose} class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all active:scale-95">
                            Done
                        </button>
                    </Show>
                </div>

            </div>
        </div>
    );
}