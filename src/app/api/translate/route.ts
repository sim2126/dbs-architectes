import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, targetLang } = await request.json();
  if (!text || !targetLang) return Response.json({ error: "Missing params" }, { status: 400 });

  // Detect source language (assume Italian/French/German/English from DBS context)
  const langMap: Record<string, string> = { en: "en", fr: "fr", it: "it", de: "de" };
  const target = langMap[targetLang] || "en";

  try {
    // MyMemory free translation API (500 words/day per IP, no key needed)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${target}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (translated) return Response.json({ translated });
    return Response.json({ error: "Translation failed" }, { status: 500 });
  } catch {
    return Response.json({ error: "Translation service unavailable" }, { status: 503 });
  }
}
