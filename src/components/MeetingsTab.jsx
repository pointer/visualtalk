import { createSignal, Show } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";
import { useScheduledMeetings } from "../lib/useScheduledMeetings";
import { MeetingsPanel } from "./MeetingsPanel";
import Schedule from "./Schedule";

/**
 * Meetings feature: full list of scheduled meetings with start / delete /
 * copy-invite actions, plus a shortcut to schedule a new one.
 *
 * Props:
 *   onJoinMeeting — (joinData) => void  (hands off to the window spawner)
 */
export function MeetingsTab(props) {
  const { t } = useI18n();
  const { meetings, startMeeting, deleteMeeting, copyInvite } =
    useScheduledMeetings({ onJoinMeeting: props.onJoinMeeting });
  const [showScheduleModal, setShowScheduleModal] = createSignal(false);

  return (
    <>
      <header class="flex items-center justify-between px-6 py-4 border-b border-gray-800/40 shrink-0 bg-[#111111]">
        <h1 class="text-lg font-semibold text-white">{t("sidebar.meetings")}</h1>
        <button
          onClick={() => setShowScheduleModal(true)}
          class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          + {t("mainWindow.schedule")}
        </button>
      </header>

      <div class="px-4 pb-6">
        <MeetingsPanel
          meetings={meetings()}
          onStart={startMeeting}
          onDelete={deleteMeeting}
          onCopy={copyInvite}
          onScheduleClick={() => setShowScheduleModal(true)}
        />
      </div>

      <Show when={showScheduleModal()}>
        <Schedule onClose={() => setShowScheduleModal(false)} />
      </Show>
    </>
  );
}
