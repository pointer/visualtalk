import { createSignal, Show } from 'solid-js';

// Floating-label form field.
//
// The label rests *inside* the control while the field is empty and blurred,
// and rides on the top edge of the control as soon as the control is focused
// or holds a value. The floated state is derived from focus + value (instead
// of pure `peer-placeholder-shown` CSS) so text inputs, textareas and native
// date/time pickers — which do not support `:placeholder-shown` — all behave
// exactly the same way.
export function FloatingField(props) {
    const [focused, setFocused] = createSignal(false);

    const floated = () => focused() || (props.value ?? "") !== "";

    const controlClasses =
        "w-full rounded-lg border-b border-[#2a2a2a] bg-[#111] px-3 pt-5 pb-2 text-white " +
        "outline-none placeholder:text-transparent [color-scheme:dark] " +
        "focus:border-blue-500 " +
        (props.class ?? "");

    const labelClasses = () =>
        "pointer-events-none absolute left-0 top-0 ml-1 bg-[#111] px-1 " +
        "transition-all duration-100 ease-linear " +
        (floated()
            ? "-translate-y-3 text-sm text-gray-200"
            : "translate-y-3 text-base text-gray-500");

    const handleInput = (event) => props.onInput?.(event.currentTarget.value);

    const focusProps = {
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
    };

    return (
        <div class={`relative ${props.fieldClass ?? ""}`}>
            <Show
                when={!props.textarea}
                fallback={
                    <textarea
                        id={props.id}
                        rows={props.rows ?? 3}
                        value={props.value ?? ""}
                        placeholder={props.placeholder}
                        readOnly={props.readOnly}
                        autofocus={props.autofocus}
                        onInput={handleInput}
                        {...focusProps}
                        class={`${controlClasses} resize-y`}
                    />
                }
            >
                <input
                    id={props.id}
                    type={props.type ?? "text"}
                    value={props.value ?? ""}
                    placeholder={props.placeholder}
                    readOnly={props.readOnly}
                    autofocus={props.autofocus}
                    onInput={handleInput}
                    {...focusProps}
                    class={controlClasses}
                />
            </Show>
            <label for={props.id} class={labelClasses()}>
                {props.label}
            </label>
        </div>
    );
}
