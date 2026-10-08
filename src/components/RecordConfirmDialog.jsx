import { useI18n } from "../i18n/I18nProvider";

/**
 * Confirmation shown before a recording starts.
 *
 * Recording other people without telling them is covert recording, so this
 * dialog exists to make the consequence explicit to the person pressing the
 * button: every participant will be shown a "being recorded" notice, and the
 * recording is written to this device.
 */
export function RecordConfirmDialog(props) {
  const { t } = useI18n();

  const points = [
    t("recordConfirm.pointNotify"),
    t("recordConfirm.pointLateJoiners"),
    t("recordConfirm.pointSaved"),
  ];

  return (
    <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      <div class="bg-[#2a2a2a] rounded-2xl shadow-2xl p-6 max-w-md w-full border border-[#3a3a3a]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 shrink-0 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center">
            <svg class="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="6" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-white">{t("recordConfirm.title")}</h3>
        </div>

        <p class="text-sm text-gray-300 mt-4">{t("recordConfirm.message")}</p>

        <ul class="mt-3 space-y-2">
          {points.map((point) => (
            <li class="flex items-start gap-2 text-xs text-gray-400 leading-5">
              <span class="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-red-500/70" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <div class="flex justify-end space-x-3 mt-6">
          <button
            onClick={props.onCancel}
            class="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded-xl text-sm text-white transition"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={props.onConfirm}
            class="px-4 py-2 bg-red-500/90 hover:bg-red-600 rounded-xl text-sm font-medium text-white transition"
          >
            {t("recordConfirm.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
