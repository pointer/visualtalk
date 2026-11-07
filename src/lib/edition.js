/**
 * Edition flags, read from the compile-time constants Vite injects
 * (`vite.config.js` → `define`).
 *
 * Import these instead of touching `__PRO_EDITION__` / `__E2EE_ENABLED__`
 * directly. Dead-code elimination still works — it keys off the same constants,
 * and Vite substitutes them here before bundling — but there is now one place
 * that spells the `typeof X !== "undefined" && X === true` dance instead of a
 * copy per component (SettingsPanel.jsx and ChatPanel.jsx each had their own).
 *
 * The two flags mean different things (Guidance.md §4): `IS_PRO_EDITION` is the
 * *edition* switch and gates paid features; `IS_E2EE_ENABLED` is the *crypto*
 * switch and only says chat/files are encrypted. Never gate a paid feature on
 * the crypto flag.
 */

/** True in a Pro Edition build (`VITE_EDITION=pro`). */
export const IS_PRO_EDITION =
  typeof __PRO_EDITION__ !== "undefined" && __PRO_EDITION__ === true;

/** True when the E2EE crypto build flag is on (`VITE_ENABLE_E2EE=true`). */
export const IS_E2EE_ENABLED =
  typeof __E2EE_ENABLED__ !== "undefined" && __E2EE_ENABLED__ === true;
