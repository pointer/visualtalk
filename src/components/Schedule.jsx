import { createSignal, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openPath } from '@tauri-apps/plugin-opener';
import { useI18n } from '../i18n/I18nProvider';
import { FloatingField } from './FloatingField';

const pad = (n) => String(n).padStart(2, "0");

export default function Schedule({ onClose }) {
    const { t } = useI18n();
    const [loading, setLoading] = createSignal(false);
    const [inviteData, setInviteData] = createSignal(null);
    const [copied, setCopied] = createSignal(false);
    const [icsPath, setIcsPath] = createSignal(null);

    const now = new Date();

    // <input type="date"> requires a plain YYYY-MM-DD value.
    const local_date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Native time inputs work with 24h "HH:MM" values.
    const local_time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // Field names mirror the Rust `MeetingInvite` struct so the form state can
    // be sent to `create_meeting_invite` as-is.
    const [scheduleData, setScheduleData] = createSignal({
        meeting_title: "",
        meeting_summary: "",
        meeting_description: "",
        meeting_room: "",
        meeting_startdate: local_date,
        meeting_starttime: local_time,
        meeting_duration: 30,
    });

    const updateScheduleField = (field, value) =>
        setScheduleData({ ...scheduleData(), [field]: value });

    const handleSchedule = async () => {
        const meeting_title = scheduleData().meeting_title.trim();
        if (!meeting_title || loading()) return;

        // The persisted meeting needs a valid start timestamp (UTC ISO),
        // same validation the pre-migration MainWindow flow performed.
        const dateValue = scheduleData().meeting_startdate;
        const timeValue = scheduleData().meeting_starttime;
        const startDate = new Date(`${dateValue}T${timeValue}`);
        if (!dateValue || !timeValue || Number.isNaN(startDate.getTime())) {
            alert(t("mainWindow.scheduleFailed"));
            return;
        }

        // Duration is entered directly in minutes; fall back to 30 if invalid.
        const durationMinutes =
            Number(scheduleData().meeting_duration) > 0
                ? Math.round(Number(scheduleData().meeting_duration))
                : 30;

        setLoading(true);
        try {
            // Call Rust to generate the room and the magic link!
            const result = await invoke('create_meeting_invite', {
                meeting: {
                    room: scheduleData().meeting_room.trim(),
                    title: meeting_title,
                }
            });

            // Persist into the scheduled-meetings store so the meeting shows up
            // in the Home and Meetings tabs (they sync via "meeting-scheduled").
            await invoke('schedule_meeting', {
                title: result.title,
                roomId: result.room,
                startTime: startDate.toISOString(),
                durationMinutes,
            });

            // Store the result together with the date/time for display purposes
            setInviteData({ ...result, meeting_date: dateValue, meeting_time: timeValue });

            // Auto-generate the iCalendar .ics file (non-blocking — scheduling
            // succeeds even if this fails).
            try {
                const icsId = `${result.room}-${Date.now()}`;
                const path = await invoke('create_icalendar_event', {
                    ics: {
                        ics_id: icsId,
                        ics_organizer: "",
                        ics_attendees: [],
                        ics_room: result.room,
                        ics_title: result.title,
                        ics_summary: scheduleData().meeting_summary || result.title,
                        ics_description: scheduleData().meeting_description,
                        ics_start_date: dateValue,
                        ics_start_time: timeValue,
                        ics_duration_minutes: durationMinutes,
                        ics_invite_link: result.invite_link,
                    }
                });
                setIcsPath(path);
            } catch (icsErr) {
                console.warn("iCalendar generation failed (scheduling still succeeded):", icsErr);
            }
        } catch (err) {
            console.error("Failed to schedule meeting:", err);
            alert(t("mainWindow.scheduleFailed"));
        } finally {
            setLoading(false);
        }
    };

    const handleCopyLink = async () => {
        const invite = inviteData();
        if (!invite) return;
        try {
            const invite_link =
                `${invite.title} — ${invite.room} — ` +
                `${invite.meeting_date} at ${invite.meeting_time} — ` +
                `${t("schedule.shareLink")} ${invite.invite_link}`;

            await writeText(invite_link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const handleDownloadIcs = async () => {
        const path = icsPath();
        if (!path) return;
        try {
            await openPath(path);
        } catch (err) {
            console.error("Failed to open .ics file:", err);
        }
    };

    return (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="schedule-meeting-title"
                class="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1c1c1c] shadow-2xl"
            >
                {/* Header */}
                <header class="flex shrink-0 items-center justify-between border-b border-[#2a2a2a] px-5 py-4 sm:px-6">
                    <h2 id="schedule-meeting-title" class="text-xl font-semibold text-white">
                        {t("schedule.title")}
                    </h2>
                    <button
                        type="button"
                        aria-label="Close dialog"
                        class="rounded-md p-2 text-gray-400 transition hover:bg-[#2a2a2a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                        onClick={onClose}
                    >
                        <span aria-hidden="true">✕</span>
                    </button>
                </header>

                {/* Scrollable form area */}
                <div class="min-h-0 flex-1 overflow-y-auto p-4 pt-6 sm:p-6 sm:pt-7">
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FloatingField
                            id="meeting-title"
                            label={t("schedule.meetingTitle")}
                            fieldClass="md:col-span-2"
                            value={scheduleData().meeting_title}
                            onInput={(value) => updateScheduleField("meeting_title", value)}
                            autofocus
                        />

                        <FloatingField
                            textarea
                            id="meeting-summary"
                            label={t("schedule.summary")}
                            rows={3}
                            value={scheduleData().meeting_summary}
                            onInput={(value) => updateScheduleField("meeting_summary", value)}
                        />

                        <FloatingField
                            textarea
                            id="meeting-description"
                            label={t("schedule.description")}
                            rows={3}
                            value={scheduleData().meeting_description}
                            onInput={(value) => updateScheduleField("meeting_description", value)}
                        />

                        <FloatingField
                            id="meeting-room"
                            label={t("schedule.roomCode")}
                            class="font-mono"
                            fieldClass="md:col-span-2"
                            value={scheduleData().meeting_room}
                            onInput={(value) => updateScheduleField("meeting_room", value)}
                        />

                        <FloatingField
                            id="meeting-startdate"
                            type="date"
                            label={t("schedule.startDate")}
                            value={scheduleData().meeting_startdate}
                            onInput={(value) => updateScheduleField("meeting_startdate", value)}
                        />

                        <FloatingField
                            id="meeting-starttime"
                            type="time"
                            label={t("schedule.startTime")}
                            value={scheduleData().meeting_starttime}
                            onInput={(value) => updateScheduleField("meeting_starttime", value)}
                        />

                        <FloatingField
                            id="meeting-duration"
                            type="number"
                            label={t("schedule.duration")}
                            value={scheduleData().meeting_duration}
                            onInput={(value) => updateScheduleField("meeting_duration", value)}
                        />
                    </div>

                    {/* Invite link (appears once the meeting is scheduled) */}
                    <Show when={inviteData()}>
                        <div class="mt-6">
                            <div class="flex items-stretch gap-2">
                                <FloatingField
                                    id="invite-link"
                                    label={t("schedule.shareLink")}
                                    readOnly
                                    class="text-sm text-gray-200"
                                    fieldClass="min-w-0 flex-1"
                                    value={inviteData().invite_link}
                                />
                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    class={`shrink-0 self-stretch rounded-md border px-4 text-sm font-medium text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${copied() ? 'border-green-600 bg-green-600 hover:bg-green-500' : 'border-[#404040] hover:bg-[#292929]'}`}
                                >
                                    {copied() ? t("common.copied") : t("common.copy")}
                                </button>
                            </div>
                            <p class="mt-1.5 text-xs text-gray-500">{t("schedule.linkNote")}</p>

                            {/* iCalendar download */}
                            <Show when={icsPath()}>
                                <button
                                    type="button"
                                    onClick={handleDownloadIcs}
                                    class="mt-3 flex items-center gap-2 rounded-md border border-[#404040] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#292929] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                                >
                                    <span aria-hidden="true">📅</span>
                                    {t("schedule.downloadIcs")}
                                </button>
                            </Show>
                        </div>
                    </Show>
                </div>

                {/* Footer */}
                <footer class="flex shrink-0 justify-end gap-2 border-t border-[#2a2a2a] px-5 py-4 sm:px-6">
                    <Show
                        when={!inviteData()}
                        fallback={
                            <button
                                type="button"
                                onClick={onClose}
                                class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                            >
                                {t("common.done")}
                            </button>
                        }
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            class="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-[#2a2a2a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            type="button"
                            onClick={handleSchedule}
                            disabled={loading() || !scheduleData().meeting_title.trim()}
                            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                        >
                            {loading() ? t("schedule.generating") : t("schedule.schedule")}
                        </button>
                    </Show>
                </footer>
            </div>
        </div>
    );
}


