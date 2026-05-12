"""
Chat title generator for DBS GPT (Aria) conversations.
Produces a 2-4 word noun phrase describing the topic of the first user message.
"""
from __future__ import annotations

import structlog
from openai import AsyncOpenAI

logger = structlog.get_logger(__name__)

_TITLE_PROMPT = """You are a chat thread titling assistant.
Goal: Produce a very short, descriptive title (2-4 words) that names the topic of the user's first message.

Rules:
- Output ONLY the title text. No prefixes, labels, quotes, emojis, hashtags, or trailing punctuation.
- Always write the title in English.
- Write a noun phrase that names the topic. Do not write instructions.
- Never output just a pronoun (me/you/I/we/us/myself/yourself).
- Never include meta-words: Summarize, Summary, Title, Prompt, Topic, Subject, About, Question, Request, Chat.
- Max 5 words.

Examples:
User: "Which projects are stuck?" -> Stuck projects overview
User: "Show team workload" -> Team workload analysis
User: "What deadlines are coming up?" -> Upcoming deadlines
User: "Portfolio health overview" -> Portfolio health

### User Message:
{user_message}
"""


async def generate_chat_title(
    user_message: str,
    *,
    model: str = "gpt-4o-mini",
    fallback: str = "New chat",
) -> str:
    """
    Generate a short descriptive title from the user's first message.

    Args:
        user_message: The first message the user sent in the conversation.
        model: OpenAI model to use (default: gpt-4o-mini for cost efficiency).
        fallback: Title to return if generation fails.

    Returns:
        A 2-5 word title string.
    """
    if not user_message or not user_message.strip():
        return fallback

    try:
        client = AsyncOpenAI()
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": _TITLE_PROMPT.format(user_message=user_message[:500]),
                }
            ],
            max_tokens=20,
            temperature=0.3,
        )
        title = response.choices[0].message.content or ""
        title = title.strip().strip('"').strip("'")

        # Enforce max length
        words = title.split()
        if len(words) > 6:
            title = " ".join(words[:6]) + "…"

        return title or fallback

    except Exception as exc:
        logger.warning("chat_title_generation_failed", error=str(exc))
        return fallback
