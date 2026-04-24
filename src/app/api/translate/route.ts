import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// Full language names for the model prompt
const LANG_NAMES: Record<string, string> = {
  en: "English",
  it: "Italian",
  fr: "French",
  de: "German",
  hi: "Hindi",
  es: "Spanish",
  pt: "Portuguese",
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  ru: "Russian",
};

// In-memory cache: "text||targetLang" → translated string
// Prevents duplicate LLM calls within the same server instance
const cache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 500;
const MAX_TEXT_CHARS = 4000;

function remember(cacheKey: string, translated: string) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey, translated);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, targetLang } = await request.json() as { text: string; targetLang: string };
  if (!text?.trim() || !targetLang) {
    return Response.json({ error: "Missing params" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return Response.json({ error: "Text too long" }, { status: 413 });
  }

  const targetName = LANG_NAMES[targetLang] ?? targetLang.toUpperCase();
  const cacheKey = `${text}||${targetLang}`;

  const cached = cache.get(cacheKey);
  if (cached) return Response.json({ translated: cached });

  // ── Primary: GPT-4o-mini ─────────────────────────────────────
  // Handles: romanized scripts, Hinglish, code-switching, slang,
  // emoji-mixed text, and any standard language automatically.
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are an expert multilingual translator. Translate the user's message to ${targetName}.

Key rules:
- Auto-detect source language regardless of how it is written — including romanized scripts (e.g. "kya kar rhe ho" = Hindi), code-mixed text (Hinglish, Franglais, Spanglish), slang, abbreviations, or emoji-mixed messages
- Translate the full intended meaning naturally — do not transliterate
- Preserve the original tone (casual stays casual, formal stays formal)
- Return ONLY the translated text. No explanations, no quotes, no extra commentary.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
      });

      const translated = completion.choices[0]?.message?.content?.trim();
      if (translated) {
        remember(cacheKey, translated);
        return Response.json({ translated, engine: "gpt-4o-mini" });
      }
    } catch {
      // Fall through to fallback
    }
  }

  // ── Fallback: MyMemory (no key required) ─────────────────────
  // Used only when OpenAI is unavailable. Quality is limited.
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${targetLang}`;
    const res = await fetch(url);
    const data = await res.json() as { responseData?: { translatedText?: string } };
    const translated = data?.responseData?.translatedText;
    if (translated) {
      remember(cacheKey, translated);
      return Response.json({ translated, engine: "mymemory" });
    }
  } catch {
    // Both failed
  }

  return Response.json({ error: "Translation unavailable" }, { status: 503 });
}
