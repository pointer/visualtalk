import { createSignal, Show } from "solid-js";

export function Modal(props) {
  return (
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div class="bg-[#1c1c1c] w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">{props.title}</h3>
          <button
            onClick={props.onClose}
            class="text-gray-400 hover:text-white transition"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-6">
          {props.children}
        </div>
        <div class="px-6 py-4 bg-[#181818] border-t border-gray-800 flex justify-end space-x-3">
          <button
            onClick={props.onClose}
            class="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={props.onConfirm}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition shadow-md"
          >
            {props.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
