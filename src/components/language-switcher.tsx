"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguageStore, type Language } from "@/lib/language-store";
import { LANGUAGE_NAMES, LANGUAGE_FLAGS } from "@/lib/translations";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguageStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Switch language"
      >
        <span className="text-base leading-none">{LANGUAGE_FLAGS[language]}</span>
        <span className="font-medium hidden sm:inline">{language.toUpperCase()}</span>
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
              className="absolute right-0 top-10 w-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50"
            >
              {(["en", "fr", "it", "de"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => { setLanguage(lang); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
                    language === lang
                      ? "bg-foreground text-background"
                      : "hover:bg-accent text-foreground"
                  }`}
                >
                  <span className="text-base">{LANGUAGE_FLAGS[lang]}</span>
                  <span>{LANGUAGE_NAMES[lang]}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
