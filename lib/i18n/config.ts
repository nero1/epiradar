/**
 * i18n configuration for next-intl.
 * English is the active locale for MVP.
 * Architecture supports Hausa (ha), Yoruba (yo), and Igbo (ig) — add message files in /messages/ to enable.
 *
 * To add a locale:
 * 1. Create /messages/{locale}.json
 * 2. Add the locale to SUPPORTED_LOCALES below
 * 3. Add translations for all keys in en.json
 */

export const DEFAULT_LOCALE = "en" as const;

export const SUPPORTED_LOCALES = ["en", "ha", "yo", "ig"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Display names for the locale picker */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ha: "Hausa",
  yo: "Yorùbá",
  ig: "Igbo",
};

/** Returns message bundle for a given locale, falling back to English */
export async function getMessages(locale: string) {
  try {
    return (await import(`../../messages/${locale}.json`)).default;
  } catch {
    return (await import("../../messages/en.json")).default;
  }
}
