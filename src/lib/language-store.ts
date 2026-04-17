import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "en" | "fr" | "it" | "de";

// Extended list for message translation targets (not all need UI translations)
export const TRANSLATION_LANGUAGES: { code: string; label: string; flag: string }[] = [
  { code: "en", label: "English",    flag: "🇬🇧" },
  { code: "it", label: "Italiano",   flag: "🇮🇹" },
  { code: "fr", label: "Français",   flag: "🇫🇷" },
  { code: "de", label: "Deutsch",    flag: "🇩🇪" },
  { code: "hi", label: "हिन्दी",       flag: "🇮🇳" },
  { code: "es", label: "Español",    flag: "🇪🇸" },
  { code: "pt", label: "Português",  flag: "🇵🇹" },
  { code: "zh", label: "中文",        flag: "🇨🇳" },
  { code: "ar", label: "العربية",     flag: "🇸🇦" },
  { code: "ru", label: "Русский",    flag: "🇷🇺" },
];

interface LanguageStore {
  // UI language — controls nav, buttons, labels (EN/IT/FR/DE)
  language: Language;
  setLanguage: (lang: Language) => void;

  // Translation language — what chat/thread messages are translated into
  translationLang: string;
  setTranslationLang: (lang: string) => void;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: "en",
      setLanguage: (language) => set({ language }),

      translationLang: "en",
      setTranslationLang: (translationLang) => set({ translationLang }),
    }),
    { name: "dbs-language" }
  )
);
