/**
 * Leave confirmation dialog.
 * Displays a modal asking the user to confirm leaving the meeting.
 */
export function LeaveConfirmDialog(props) {
  return (
    <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      <div class="bg-[#2a2a2a] rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-[#3a3a3a]">
        <h3 class="text-lg font-semibold text-white">Leave meeting?</h3>
        <p class="text-sm text-gray-400 mt-2">
          Are you sure you want to leave this meeting?
        </p>
        <div class="flex justify-end space-x-3 mt-6">
          <button
            onClick={props.onCancel}
            class="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded-xl text-sm text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={props.onConfirm}
            class="px-4 py-2 bg-red-500/90 hover:bg-red-600 rounded-xl text-sm text-white transition"
          >
            Leave meeting
          </button>
        </div>
      </div>
    </div>
  );
}
