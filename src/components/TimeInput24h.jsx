import { createSignal, createEffect } from "solid-js";

/**
 * TimeInput24h — a time input that always displays and edits in 24h (HH:MM).
 *
 * The native <input type="time"> renders according to the OS / webview locale
 * (e.g. "10:00 AM" on macOS set to en_US) and offers no way to force a 24h
 * display. This component keeps the exact same plain "HH:MM" 24h value format
 * the native input produces, so it drops into existing state unchanged, while
 * masking and clamping user input so an invalid time can never be emitted.
 *
 * Props:
 *   - value:    "HH:MM" 24h string (controlled from the parent)
 *   - onChange: (value: string) => void — called with a valid "HH:MM" string
 *   - class:    optional Tailwind class override
 */
export function TimeInput24h(props) {
  const [text, setText] = createSignal(props.value ?? "");
  const [focused, setFocused] = createSignal(false);

  // Follow external value changes while the user is not editing.
  createEffect(() => {
    const next = props.value ?? "";
    if (!focused() && next !== text()) setText(next);
  });

  // Keep only digits (max 4) and re-insert the colon after the 2nd digit.
  const sanitize = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  };

  const isValid = (val) => /^([01]\d|2[0-3]):[0-5]\d$/.test(val);

  // Pad / clamp partial or out-of-range input into a valid HH:MM.
  const normalize = (val) => {
    const m = val.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (!m) return "00:00";
    const hh = Math.min(23, parseInt(m[1], 10) || 0);
    const mm = m[2] ? Math.min(59, parseInt(m[2], 10) || 0) : 0;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const handleInput = (e) => {
    const next = sanitize(e.currentTarget.value);
    setText(next);
    if (isValid(next)) props.onChange?.(next);
  };

  const handleBlur = () => {
    setFocused(false);
    const next = normalize(text());
    setText(next);
    props.onChange?.(next);
  };

  return (
    <input
      type="text"
      inputmode="numeric"
      autocomplete="off"
      spellcheck={false}
      maxlength={5}
      placeholder="HH:MM"
      title="24h (HH:MM)"
      value={text()}
      onInput={handleInput}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      class={
        props.class ||
        "w-full px-3 py-2 rounded-lg bg-[#111111] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50"
      }
    />
  );
}
