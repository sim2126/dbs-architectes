import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "en" | "fr" | "it" | "de";

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: "en",
      setLanguage: (language) => set({ language }),
    }),
    { name: "dbs-language" }
  )
);
