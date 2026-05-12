"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Check, Languages, ChevronDown } from "lucide-react";
import { useLanguageStore, TRANSLATION_LANGUAGES, type Language } from "@/i18n/language-store";
import { LANGUAGE_NAMES } from "@/i18n/translations";
import { cn } from "@/ui/utils";

const UI_LANGUAGES: { code: Language; flag: string }[] = [
  { code: "en", flag: "🇬🇧" },
  { code: "it", flag: "🇮🇹" },
  { code: "fr", flag: "🇫🇷" },
  { code: "de", flag: "🇩🇪" },
];

const LANG_LABEL: Record<Language, string> = { en: "EN", it: "IT", fr: "FR", de: "DE" };

export function LanguageSwitcher() {
  const { language, setLanguage, translationLang, setTranslationLang } = useLanguageStore();
  const [open, setOpen] = useState(false);
  const [transOpen, setTransOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const currentTransLang = TRANSLATION_LANGUAGES.find((l) => l.code === translationLang);

  // Close on outside click (mousedown so it fires before any click handlers inside)
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTransOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setTransOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => { setOpen(!open); setTransOpen(false); }}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-transparent hover:border-border"
        title="Language & Translation preferences"
      >
        <Globe className="w-3.5 h-3.5 shrink-0" />
        <span>{LANG_LABEL[language]}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-10 w-64 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
          >
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <p className="text-xs font-semibold text-foreground">Language Preferences</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Saved automatically to your session</p>
              </div>

              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe className="w-3 h-3 text-muted-foreground" />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Interface Language</p>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2.5 leading-relaxed">Changes all labels, buttons and navigation text.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {UI_LANGUAGES.map(({ code, flag }) => {
                    const isActive = language === code;
                    return (
                      <button
                        key={code}
                        onClick={() => setLanguage(code)}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-all",
                          isActive
                            ? "bg-foreground text-background"
                            : "border border-border hover:bg-accent text-foreground hover:border-foreground/20"
                        )}
                      >
                        <span className="text-sm leading-none">{flag}</span>
                        <span className="font-semibold">{LANG_LABEL[code]}</span>
                        <span className="text-[10px] opacity-60 truncate">{LANGUAGE_NAMES[code]}</span>
                        {isActive && <Check className="w-3 h-3 ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Languages className="w-3 h-3 text-muted-foreground" />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Translation Language</p>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2.5 leading-relaxed">
                  Chat and thread messages will translate into this language when you tap Translate.
                </p>

                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setTransOpen((v) => !v); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-border hover:border-foreground/20 bg-background hover:bg-accent transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none">{currentTransLang?.flag ?? "🌐"}</span>
                      <span className="text-xs font-medium">{currentTransLang?.label ?? translationLang.toUpperCase()}</span>
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", transOpen && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {transOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.1 }}
                        className="absolute bottom-full mb-1 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10 max-h-52 overflow-y-auto"
                      >
                        {TRANSLATION_LANGUAGES.map((lang) => {
                          const isActive = translationLang === lang.code;
                          return (
                            <button
                              key={lang.code}
                              onClick={(e) => { e.stopPropagation(); setTranslationLang(lang.code); setTransOpen(false); }}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                                isActive ? "bg-foreground text-background" : "hover:bg-accent text-foreground"
                              )}
                            >
                              <span className="text-base leading-none shrink-0">{lang.flag}</span>
                              <span className="flex-1 text-xs font-medium">{lang.label}</span>
                              {isActive && <Check className="w-3 h-3 shrink-0" />}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
