import { NextRequest } from "next/server";
import { aiDisabledResponse, isAiDisabled } from "@/features/ai/domain/ai-flags";
import { auth } from "@/platform/auth";
import { toSafeAiFailure } from "@/platform/ai/provider";
import {
  TRANSLATION_LANGUAGES,
  translateGroundedText,
} from "@/platform/integrations/translator";

const MAX_TEXT_CHARS = 4000;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (isAiDisabled()) return aiDisabledResponse();

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const text = body?.text;
  const targetLang = body?.targetLang;
  if (typeof text !== "string" || !text.trim() || typeof targetLang !== "string") {
    return Response.json({ error: "Missing params" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return Response.json({ error: "Text too long" }, { status: 413 });
  }
  if (!Object.hasOwn(TRANSLATION_LANGUAGES, targetLang)) {
    return Response.json({ error: "Unsupported target language" }, { status: 400 });
  }

  try {
    const result = await translateGroundedText({
      text,
      targetLang,
      subject: { userId: session.user.id, role: session.user.role },
    });
    return Response.json(result);
  } catch (error) {
    const failure = toSafeAiFailure("translation", error);
    return Response.json({ error: failure.message }, { status: failure.httpStatus });
  }
}
