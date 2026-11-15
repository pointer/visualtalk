import { createSignal } from "solid-js";

/**
 * OS deep links — `visualtalk://join?…` (ADR 0007).
 *
 * Clicking an invite link opens VisualTalk instead of making the guest
 * copy-paste the text into the Join dialog. The URL is untrusted input: it is
 * only ever handed to Rust's `parse_invite_link`, and LiveKit (or the organizer's
 * guest-token issuer) still validates the credential before anyone joins. The
 * Join dialog also keeps showing the room and asking for a name, because on
 * Android/Windows/Linux any app can register a custom scheme.
 *
 * Delivery differs by platform, and both paths are handled here:
 *   - macOS / iOS / Android: the plugin emits an event, and `getCurrent()`
 *     reports the URL that cold-started the app.
 *   - Windows / Linux: the OS spawns a SECOND process with the URL as an
 *     argument; `tauri-plugin-single-instance` (registered first, with its
 *     `deep-link` feature) forwards it to the window that is already open.
 */
const INVITE_SCHEME = "visualtalk://";

/** Link waiting to be shown in the Join dialog, or null. */
export const [pendingInviteLink, setPendingInviteLink] = createSignal(null);

/** Clears the pending link once the Join dialog has taken it. */
export function consumePendingInviteLink() {
  setPendingInviteLink(null);
}

/** The first `visualtalk://` URL in a list, or null. Pure, for tests. */
export function pickInviteLink(urls) {
  if (!Array.isArray(urls)) return null;
  return urls.find((url) => typeof url === "string" && url.startsWith(INVITE_SCHEME)) || null;
}

/**
 * Subscribe to deep links. Resolves to a function that unsubscribes. Safe in a
 * plain browser (`pnpm dev` has no Tauri APIs): it logs once and does nothing.
 */
export async function initDeepLinks() {
  if (typeof window === "undefined") return () => {};
  try {
    const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
    const unlisten = await onOpenUrl((urls) => {
      const invite = pickInviteLink(urls);
      if (invite) setPendingInviteLink(invite);
    });
    // A cold start does not always replay through onOpenUrl.
    const invite = pickInviteLink(await getCurrent().catch(() => null));
    if (invite) setPendingInviteLink(invite);
    return unlisten;
  } catch (err) {
    console.warn("Deep links unavailable:", err);
    return () => {};
  }
}