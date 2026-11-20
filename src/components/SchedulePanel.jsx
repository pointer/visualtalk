import { createSignal, For, onMount, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { useI18n } from '../i18n/I18nProvider';
import { FloatingField } from './FloatingField';
import { errorMessage } from '../lib/errors';
import { IS_MOBILE } from '../lib/platform';

const pad = (n) => String(n).padStart(2, "0");

export default function SchedulePanel({ onClose }) {
    const { t } = useI18n();
    const [loading, setLoading] = createSignal(false);
    // Stays null until `create_meeting_invite` succeeds, so it doubles as the
    // "this meeting already exists" flag used to lock the Schedule action.
    const [inviteData, setInviteData] = createSignal(null);
    const [copied, setCopied] = createSignal("");
    const [icsPath, setIcsPath] = createSignal(null);
    const [userEmail, setUserEmail] = createSignal("");
    const [contactsError, setContactsError] = createSignal("");
    const [sendState, setSendState] = createSignal({});
    const deliveryMethod = IS_MOBILE ? "sms" : "email";
    const contactProperty = IS_MOBILE ? "tel" : "email";
    const [sending, setSending] = createSignal(false);
    const [sendResults, setSendResults] = createSignal([]);
    const [sendError, setSendError] = createSignal("");

    const supportsContactPicker = () =>
        typeof navigator !== "undefined" &&
        typeof navigator.contacts?.select === "function" &&
        typeof navigator.contacts?.getProperties === "function";

    // Fetch the user's profile email so we can set it as ORGANIZER in the .ics
    onMount(async () => {
        try {
            const profile = await invoke("get_user_profile");
            if (profile.email) setUserEmail(profile.email);
        } catch (err) {
            console.warn("Could not load user profile for organizer email:", err);
        }
    });

    const now = new Date();

    // <input type="date"> requires a plain YYYY-MM-DD value.
    const local_date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Native time inputs work with 24h "HH:MM" values.
    const local_time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // Field names mirror the Rust `CreateMeetingInviteRequest` payload.
    const [scheduleData, setScheduleData] = createSignal({
        meeting_title: "",
        meeting_summary: "",
        meeting_description: "",
        meeting_room: "",
        meeting_attendees: "",
        meeting_startdate: local_date,
        meeting_starttime: local_time,
        meeting_duration: 30,
    });

    const updateScheduleField = (field, value) =>
        setScheduleData({ ...scheduleData(), [field]: value });

    const handleChooseContacts = async () => {
        setContactsError("");
        try {
            const picker = navigator.contacts;
            const properties = await picker.getProperties();
            if (!properties.includes(contactProperty)) {
                setContactsError(t("schedule.contactsNoRecipients"));
                return;
            }

            const contacts = await picker.select([contactProperty], { multiple: true });
            if (!contacts.length) return;

            const recipients = await invoke("normalize_invitees", {
                rawRecipients: scheduleData().meeting_attendees,
                contacts,
                deliveryMethod,
            });
            if (!recipients.length) {
                setContactsError(t("schedule.contactsNoRecipients"));
                return;
            }

            updateScheduleField(
                "meeting_attendees",
                recipients.join(IS_MOBILE ? ";\n" : ", "),
            );
        } catch (err) {
            if (err?.name === "AbortError") return;
            console.error("Could not select meeting invite contacts:", err);
            setContactsError(err?.toString?.().replace(/^Error: /, "") || t("schedule.contactsPickerFailed"));
        }
    };

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
            const attendees = await invoke("normalize_invitees", {
                rawRecipients: scheduleData().meeting_attendees,
                contacts: [],
                deliveryMethod,
            });
            // Rust signs a distinct LiveKit token for each guest.
            const result = await invoke('create_meeting_invite', {
                meeting: {
                    room: scheduleData().meeting_room.trim(),
                    title: meeting_title,
                    attendees,
                    delivery_method: deliveryMethod,
                    start_time: startDate.toISOString(),
                    duration_minutes: durationMinutes,
                }
            });

            // Persist into the scheduled-meetings store so the meeting shows up
            // in the Home and Meetings tabs (they sync via "meeting-scheduled").
            await invoke('schedule_meeting', {
                title: result.title,
                roomId: result.room,
                startTime: startDate.toISOString(),
                durationMinutes,
                inviteLink: result.invite_link,
            });

            // Store the result together with the date/time for display purposes
            setInviteData({ ...result, meeting_date: dateValue, meeting_time: timeValue });

            // Auto-generate the iCalendar .ics file (non-blocking — scheduling
            // succeeds even if this fails).
            try {
                const icsId = `${result.room}-${Date.now()}`;
                const icsAttendees = result.attendee_invites
                    .filter((invite) => invite.delivery_method === "email")
                    .map((invite) => invite.recipient)
                    .filter(Boolean);
                const path = await invoke('create_icalendar_event', {
                    ics: {
                        ics_id: icsId,
                        ics_organizer: userEmail(),
                        ics_attendees: icsAttendees,
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
            alert(`${t("mainWindow.scheduleFailed")}\n${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyLink = async (attendeeInvite) => {
        const invite = inviteData();
        if (!invite) return;
        try {
            const invite_link =
                `${invite.title} — ${invite.room} — ` +
                `${invite.meeting_date} at ${invite.meeting_time} — ` +
                `${attendeeInvite.recipient ? `${attendeeInvite.recipient}\n` : ""}` +
                `${t("schedule.shareLink")} ${attendeeInvite.invite_link}`;

            // Webview clipboard, same as HomeTab/useScheduledMeetings: the Rust
            // `tauri-plugin-clipboard-manager` is not registered in this app, so
            // the plugin's `writeText` IPC would be rejected.
            await navigator.clipboard.writeText(invite_link);
            setCopied(attendeeInvite.identity);
            setTimeout(() => setCopied(""), 2000);
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

    const handleSendInvite = async (attendeeInvite) => {
        const invite = inviteData();
        if (!invite) return;
        if (!attendeeInvite.recipient) return;
        const identity = attendeeInvite.identity;
        setSendState({ ...sendState(), [identity]: { loading: true } });
        try {
            await invoke("send_meeting_invite", {
                request: {
                    invite: attendeeInvite,
                    meeting_title: invite.title,
                    meeting_room: invite.room,
                    meeting_date: invite.meeting_date,
                    meeting_time: invite.meeting_time,
                    share_link_label: t("schedule.shareLink"),
                },
            });
            setSendState({
                ...sendState(),
                [identity]: { message: t("schedule.inviteSent"), success: true },
            });
        } catch (err) {
            console.error("Failed to send meeting invite:", err);
            setSendState({ ...sendState(), [identity]: { message: errorMessage(err) } });
        }
    };

    async function handleSendInvitations() {
        if (sending()) return;

        setSendError("");
        setSendResults([]);

        const invite = inviteData();
        const invites = invite?.attendee_invites;

        if (!Array.isArray(invites) || invites.length === 0) {
            setSendError(t("schedule.noInvitationsToSend"));
            return;
        }

        setSending(true);

        try {
            // `invites` is forwarded verbatim from `create_meeting_invite`; the
            // meeting-level context travels alongside it as separate arguments
            // because the Rust `AttendeeInvite` only carries per-guest data.
            const results = await invoke("send_invitations", {
                invites,
                title: invite.title,
                room: invite.room,
                meetingDate: invite.meeting_date,
                meetingTime: invite.meeting_time,
                shareLinkLabel: t("schedule.shareLink"),
            });

            setSendResults(results);
        } catch (error) {
            // Surface the rejection: an IPC argument mismatch fails before the
            // Rust handler runs, which is otherwise indistinguishable from the
            // command never being called at all.
            console.error("Failed to send invitations:", error);
            setSendError(errorMessage(error));
        } finally {
            setSending(false);
        }
    }
    return (
        // z-[100] (same as Modal.jsx) so the dialog + footer stay above the
        // mobile bottom tab bar (z-50), which otherwise covers the buttons.
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
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

                        <div class="md:col-span-2 flex items-end gap-2">
                            <FloatingField
                                textarea
                                id="meeting-attendees"
                                autocomplete={IS_MOBILE ? "tel" : "email"}
                                inputmode={IS_MOBILE ? "tel" : "email"}
                                rows={2}
                                label={t(IS_MOBILE ? "schedule.phoneNumbers" : "schedule.attendees")}
                                placeholder={t(IS_MOBILE ? "schedule.phoneNumbersPlaceholder" : "schedule.attendeesPlaceholder")}
                                fieldClass="min-w-0 flex-1"
                                value={scheduleData().meeting_attendees}
                                onInput={(value) => updateScheduleField("meeting_attendees", value)}
                            />
                            <Show when={supportsContactPicker()}>
                                <button
                                    type="button"
                                    onClick={handleChooseContacts}
                                    class="shrink-0 rounded-md border border-[#404040] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#292929] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                                >
                                    {t("schedule.chooseContacts")}
                                </button>
                            </Show>
                        </div>
                        <Show when={contactsError()}>
                            <p role="status" class="md:col-span-2 text-xs text-amber-300">
                                {contactsError()}
                            </p>
                        </Show>

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
                    {/* Each attendee gets a distinct token and invite link. The
                        note explains link lifetime, so it only makes sense once
                        the meeting — and therefore the links — exist. */}
                    <Show when={inviteData()}>
                        <p class="mt-3 text-xs text-gray-500">
                            {t(inviteData().shared_link ? "schedule.sharedLinkNote" : "schedule.linkNote")}
                        </p>
                    </Show>
                </div>

                {/* Footer: the actions stay pinned while the form scrolls. */}
                <footer class="shrink-0 border-t border-[#2a2a2a] px-5 py-4 sm:px-6">
                    {/* Bulk-send rejection. Without this the IPC error is
                        swallowed and the command looks "not called". Kept above
                        the button row so it never becomes a flex item inside it. */}
                    <Show when={sendError()}>
                        <p role="alert" class="mb-2 text-xs text-red-400">
                            {sendError()}
                        </p>
                    </Show>
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            class="mr-auto rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-[#2a2a2a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            type="button"
                            onClick={handleSendInvitations}
                            disabled={sending() || (inviteData()?.attendee_invites?.length ?? 0) === 0}
                            aria-busy={sending()}
                            class="rounded-md border border-[#404040] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#292929] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                        >
                            {sending() ? t("schedule.sending") : t("schedule.sendInvite")}
                        </button>
                        {/* Scheduling a second time would create a duplicate room
                            and a duplicate entry in the scheduled-meetings store,
                            so the action locks once the meeting exists. */}
                        <button
                            type="button"
                            onClick={handleSchedule}
                            disabled={loading() || !!inviteData() || !scheduleData().meeting_title.trim()}
                            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                        >
                            {loading()
                                ? t("schedule.generating")
                                : inviteData()
                                    ? t("schedule.scheduled")
                                    : t("schedule.schedule")}
                        </button>
                    </div>
                </footer>

                {/* Bulk-send outcome, hoisted out of the footer so it is a sibling
                    of the dialog: `absolute inset-0` resolves against the fixed
                    overlay above, and z-10 keeps it clear of the dialog itself. */}
                <Show when={sendResults().length > 0}>
                    <div
                        class="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4"
                        onClick={() => setSendResults([])}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-live="polite"
                            class="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-4 text-gray-100 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div class="mb-2.5 flex items-center justify-between border-b border-gray-800 pb-2">
                                <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    {t("schedule.sendResultsTitle")}
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSendResults([]);
                                    }}
                                    aria-label={t("common.close")}
                                    class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-600"
                                >
                                    <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                </button>
                            </div>

                            <ul class="max-h-64 space-y-1.5 overflow-y-auto text-xs">
                                <For each={sendResults()}>
                                    {(result) => (
                                        <li
                                            class={`whitespace-pre-line break-words leading-relaxed ${result.accepted ? "text-emerald-400" : "text-red-400"
                                                }`}
                                        >
                                            {result.recipient || t("schedule.unknownRecipient")}
                                            <Show when={result.channel}>
                                                <span class="text-gray-500"> ({result.channel})</span>
                                            </Show>
                                            {" — "}
                                            {result.accepted
                                                ? t("schedule.inviteSent")
                                                : result.error || t("schedule.inviteFailed")}
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </div>
                    </div>
                </Show>

            </div>
        </div>
    );
}
