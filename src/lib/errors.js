/**
 * Dual-shape reader for Tauri command rejections.
 *
 * Commands in this app reject in one of two shapes:
 *
 *  1. a plain string — the historical `Result<T, String>` contract, still used
 *     by most commands and relied upon by the E2EE ones, whose
 *     `E2EE_KEY_CHANGED` / `E2EE_REPLAY` codes are substring-matched in chat.jsx;
 *  2. an `AppError` object — `{ kind, message }` (camelCase), returned by the
 *     network-facing commands in `src-tauri/src/error.rs`.
 *
 * Everything here accepts both, so converting a command one at a time cannot
 * break the ones not yet converted. The `kind` strings are pinned by the Rust
 * test `error_kind_serializes_camel_case`; each maps to an i18n key
 * `errors.network.<kind>` present in en, fr and es.
 */

const KINDS = new Set([
  "timeout",
  "auth",
  "rateLimit",
  "network",
  "serverError",
  "badResponse",
  "config",
  "internal",
]);

/**
 * The failure category, or `"unknown"` for a plain string / unrecognised shape.
 * @param {unknown} err - The value an `invoke()` rejection produced.
 * @returns {string}
 */
export function errorKind(err) {
  if (err && typeof err === "object" && typeof err.kind === "string" && KINDS.has(err.kind)) {
    return err.kind;
  }
  return "unknown";
}

/**
 * The untranslated detail line: the provider's own text for an `AppError`, the
 * string itself for the legacy shape. Safe to log and to show as a secondary
 * line; use `errorI18nKey` for the headline.
 * @param {unknown} err
 * @returns {string}
 */
export function errorMessage(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && typeof err.message === "string" && err.message) {
    return err.message;
  }
  return String(err);
}

/**
 * The i18n key for the localized headline, e.g. `errors.network.auth`.
 * @param {unknown} err
 * @returns {string}
 */
export function errorI18nKey(err) {
  const kind = errorKind(err);
  return kind === "unknown" ? "errors.network.unknown" : `errors.network.${kind}`;
}
