import OpenAI from "openai";
import { z } from "zod";
import { buildTranslationGroundingContract } from "@/platform/ai/contracts";
import {
  hasExactResolvedReferences,
  resolveGrounding,
  serialiseResolvedContext,
  type GroundingSubject,
} from "@/platform/ai/grounding";
import {
  AiProviderFailure,
  createOpenAIStructuredCompletion,
  parseStructuredOutput,
} from "@/platform/ai/provider";
import { validateGrounding, type GroundingValidationIssue } from "@/platform/ai/validation";

export const TRANSLATION_LANGUAGES: Readonly<Record<string, string>> = {
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

const translationOutputSchema = z.object({
  translated: z.string().min(1),
  user_ids: z.array(z.string()),
  project_ids: z.array(z.string()),
  phases: z.array(z.string()),
  dates: z.array(z.string()),
}).strict();

type TranslationOutput = z.infer<typeof translationOutputSchema>;
const translationJsonSchema = { ...z.toJSONSchema(translationOutputSchema) } as Record<
  string,
  unknown
>;
delete translationJsonSchema.$schema;

const cache = new Map<string, TranslationOutput>();
const MAX_CACHE_ENTRIES = 500;

function remember(cacheKey: string, output: TranslationOutput): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey, output);
}

interface TranslationDependencies {
  client?: OpenAI;
  resolve?: typeof resolveGrounding;
}

export interface GroundedTranslation {
  translated: string;
  engine: "gpt-4o-mini";
  groundingIssues: GroundingValidationIssue[];
}

export async function translateGroundedText(
  input: { text: string; targetLang: string; subject: GroundingSubject },
  dependencies: TranslationDependencies = {},
): Promise<GroundedTranslation> {
  const targetName = TRANSLATION_LANGUAGES[input.targetLang];
  if (!targetName) throw new TypeError("Unsupported target language");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!dependencies.client && !apiKey) throw new AiProviderFailure("unavailable");

  const resolve = dependencies.resolve ?? resolveGrounding;
  const resolved = await resolve(buildTranslationGroundingContract({
    subject: input.subject,
    input: input.text,
  }));
  const cacheKey = `${input.text}||${input.targetLang}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    const validation = validateGrounding(cached, resolved, { mode: "strip" });
    if (validation.valid && hasExactResolvedReferences(resolved, {
      userIds: validation.output.user_ids,
      projectIds: validation.output.project_ids,
      phases: validation.output.phases,
      dates: validation.output.dates,
    })) {
      return {
        translated: validation.output.translated,
        engine: "gpt-4o-mini",
        groundingIssues: validation.issues,
      };
    }
    cache.delete(cacheKey);
  }

  const client = dependencies.client ?? new OpenAI({ apiKey });
  const completion = await createOpenAIStructuredCompletion(client, {
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content: `You are an expert multilingual translator. Translate the user's message to ${targetName}.

Key rules:
- Auto-detect source language, including romanised and code-mixed text
- Translate the full intended meaning naturally; do not transliterate
- Preserve the original tone
- Preserve resolved DBS names and project codes exactly
- Return "translated", exact resolved "user_ids" and "project_ids", canonical "phases", and resolved ISO "dates". Never invent a value.

Authoritative resolved context:
${serialiseResolvedContext(resolved)}`,
      },
      { role: "user", content: input.text },
    ],
  }, {
    model: "gpt-4o-mini",
    temperature: 0.1,
    schemaName: "translation_result",
    schema: translationJsonSchema,
  });

  const parsed = parseStructuredOutput(
    completion.choices[0]?.message?.content,
    (value) => translationOutputSchema.parse(value),
  );
  const validation = validateGrounding(parsed, resolved, { mode: "strip" });
  if (!validation.valid || !hasExactResolvedReferences(resolved, {
    userIds: validation.output.user_ids,
    projectIds: validation.output.project_ids,
    phases: validation.output.phases,
    dates: validation.output.dates,
  })) {
    throw new AiProviderFailure("invalid_output");
  }
  if (validation.issues.length) {
    console.warn("Translation grounding issues", { issues: validation.issues });
  }
  const output = { ...validation.output, translated: validation.output.translated.trim() };
  remember(cacheKey, output);
  return {
    translated: output.translated,
    engine: "gpt-4o-mini",
    groundingIssues: validation.issues,
  };
}
