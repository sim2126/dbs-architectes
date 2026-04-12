"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Check } from "lucide-react";
import { useLanguageStore, type Language } from "@/lib/language-store";
import { LANGUAGE_NAMES } from "@/lib/translations";

const LANG_LABEL: Record<Language, string> = {
  en: "EN",
  it: "IT",
  fr: "FR",
  de: "DE",
};

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguageStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-transparent hover:border-border"
        title="Switch language"
      >
        <Globe className="w-3.5 h-3.5 shrink-0" />
        <span>{LANG_LABEL[language]}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-10 w-44 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50"
            >
              {(["en", "it", "fr", "de"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => { setLanguage(lang); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
                    language === lang
                      ? "bg-foreground text-background"
                      : "hover:bg-accent text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-bold font-mono w-6 shrink-0 opacity-60">{LANG_LABEL[lang]}</span>
                    <span className="font-medium">{LANGUAGE_NAMES[lang]}</span>
                  </div>
                  {language === lang && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
