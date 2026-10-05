import { createContext, useContext, createSignal, createEffect, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import es from "../locales/es.json";

/**
 * All available dictionaries, keyed by locale code.
 * English is always the fallback.
 */
const dictionaries = { en, fr, es };

/**
 * Human-readable locale metadata for the settings dropdown.
 */
const availableLocales = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "es", name: "Spanish", nativeName: "Español" },
];

const STORAGE_KEY = "visualtalk_locale";

const I18nContext = createContext();

/**
 * Resolve the best locale to use.
 * Priority: saved preference → OS locale (via Rust) → browser language → "en".
 */
async function resolveInitialLocale() {
  // 1. Saved user preference
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && dictionaries[saved]) return saved;
  } catch {
    // localStorage may be unavailable in some contexts
  }

  // 2. OS system locale via Rust backend
  try {
    const sysLocale = await invoke("get_system_locale");
    if (sysLocale) {
      // Rust returns e.g. "en_US.UTF-8", "fr_FR.UTF-8" — normalize to "en", "fr"
      const lang = sysLocale.split("_")[0].split(".")[0].toLowerCase();
      if (dictionaries[lang]) return lang;
    }
  } catch {
    // Command may not exist or may fail — continue to next fallback
  }

  // 3. Browser / webview language
  try {
    const browserLang = (navigator.language || "en").split("-")[0].toLowerCase();
    if (dictionaries[browserLang]) return browserLang;
  } catch {
    // navigator may be unavailable
  }

  // 4. Hardcoded fallback
  return "en";
}

/**
 * I18nProvider — wraps the app with reactive i18n context.
 *
 * Provides:
 *   - t(key, params?)  — translate a key, with optional {param} interpolation
 *   - locale()         — current locale signal
 *   - changeLocale(l)  — switch language and persist the choice
 *   - availableLocales — list of { code, name, nativeName }
 */
export function I18nProvider(props) {
  const [locale, setLocale] = createSignal("en");
  const [dict, setDict] = createSignal(dictionaries.en);

  // Resolve initial locale on mount
  resolveInitialLocale().then((resolved) => {
    setLocale(resolved);
    setDict(dictionaries[resolved] || dictionaries.en);
    persistLocale(resolved);
  });

  // Keep <html lang> in sync
  createEffect(
    on(locale, (l) => {
      document.documentElement.lang = l;
    })
  );

  function persistLocale(l) {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // silently ignore
    }
  }

  function changeLocale(newLocale) {
    if (!dictionaries[newLocale]) return;
    setLocale(newLocale);
    setDict(dictionaries[newLocale]);
    persistLocale(newLocale);
  }

  /**
   * Translate a key with optional parameter interpolation.
   *
   *   t("settings.email")              → "Email"
   *   t("greeting", { name: "Alice" }) → "Hello, Alice!"  (if key uses {name})
   *
   * Falls back to the English dictionary, then to the raw key.
   */
  function t(key, params) {
    let value = dict()[key];

    // Fallback to English
    if (value === undefined && locale() !== "en") {
      value = dictionaries.en[key];
    }

    // Fallback to the key itself (so missing keys are visible, not blank)
    if (value === undefined) {
      if (import.meta.env?.DEV) {
        console.warn(`[i18n] Missing key: "${key}" in locale "${locale()}"`);
      }
      return key;
    }

    // Interpolate {param} placeholders
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }

    return value;
  }

  return (
    <I18nContext.Provider value={{ t, locale, changeLocale, availableLocales }}>
      {props.children}
    </I18nContext.Provider>
  );
}

/**
 * Hook to access i18n context from any component.
 *
 *   const { t, locale, changeLocale } = useI18n();
 */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n() must be used within <I18nProvider>");
  }
  return ctx;
}