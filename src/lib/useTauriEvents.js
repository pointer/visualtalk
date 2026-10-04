import { createSignal, onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";

/**
 * SolidJS composable that subscribes to Rust push events and exposes
 * a reactive signal for the latest event.
 *
 * Usage:
 *   const { lastEvent, subscribe } = useTauriEvents();
 *   subscribe("profile-updated", (payload) => setProfile(payload.profile));
 *
 * All listeners are automatically cleaned up when the component unmounts.
 *
 * [CONCERN: If a component mounts/unmounts rapidly (e.g. tab switching),
 *  each mount creates a new IPC listener.  Tauri deduplicates by event name
 *  internally but the JS callback chain still grows.  Ensure `onCleanup`
 *  fires reliably calls `unlisten()` — SolidJS guarantees this for
 *  component-scoped `onCleanup` but not for manual event handlers.]
 */
export function useTauriEvents() {
  /** Raw signal holding the last event payload (or null). */
  const [lastEvent, setLastEvent] = createSignal(null);

  /** Map of type → callback for typed subscriptions. */
  const handlers = new Map();

  /**
   * Register a handler for a specific event type.
   * @param {string} type - The kebab-case event type (e.g. "profile-updated").
   * @param {(payload: object) => void} callback - Called with the full payload object.
   */
  const subscribe = (type, callback) => {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(callback);
  };

  onMount(async () => {
    // [CONCERN: We listen to a single global event name.  Every window
    //  (main + meeting windows) receives every event.  If a meeting window
    //  also mounts this composable, it will get profile/settings events
    //  it doesn't care about.  For now this is fine since unregistered
    //  types are simply ignored, but consider window-scoped listeners
    //  if the event volume grows.]
    const unlisten = await listen("visualtalk://state-change", (event) => {
      const payload = event.payload;

      // [CONCERN: If Rust sends a malformed payload (missing `type` field),
      //  this silently does nothing.  In development, a `console.warn`
      //  here would help catch serialization mismatches early.]
      if (!payload || !payload.type) return;

      setLastEvent(payload);

      const typeHandlers = handlers.get(payload.type);
      if (typeHandlers) {
        for (const cb of typeHandlers) {
          try {
            cb(payload.payload);
          } catch (err) {
            console.error(`[useTauriEvents] Handler error for "${payload.type}":`, err);
          }
        }
      }
    });

    // SolidJS guarantees this runs when the component unmounts.
    onCleanup(() => {
      unlisten();
      handlers.clear();
    });
  });

  return { lastEvent, subscribe };
}