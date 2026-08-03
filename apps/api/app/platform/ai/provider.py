"""Provider-neutral policy for factual, structured AI calls.

Feature code supplies the existing model and its JSON schema. This module
preserves that model, clamps factual extraction temperature, and requires a
structured response for OpenAI and Anthropic-shaped requests without owning a
provider SDK client.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from typing import TYPE_CHECKING, Any, Literal, TypedDict

if TYPE_CHECKING:
    from langchain_openai import ChatOpenAI

MAX_FACTUAL_TEMPERATURE = 0.2

JsonObjectSchema = dict[str, Any]
ProviderFailureKind = Literal[
    "rate_limited",
    "timeout",
    "unavailable",
    "invalid_output",
    "provider_error",
]


class SafeProviderFailure(TypedDict):
    surface: str
    kind: ProviderFailureKind
    message: str
    http_status: Literal[429, 502, 503]
    retryable: bool

_FAILURE_MESSAGES: dict[ProviderFailureKind, str] = {
    "rate_limited": "AI Assistant is temporarily busy. Please try again shortly.",
    "timeout": "AI Assistant did not receive a response in time. Please try again.",
    "unavailable": "AI Assistant is temporarily unavailable. Please try again shortly.",
    "invalid_output": "AI Assistant could not produce a validated response. Please try again.",
    "provider_error": "AI Assistant could not complete this request. Please try again.",
}


class ProviderFailure(RuntimeError):
    """Safe, user-legible provider failure with no upstream detail in its message."""

    def __init__(
        self,
        kind: ProviderFailureKind,
        *,
        status_code: int | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(_FAILURE_MESSAGES[kind])
        self.kind = kind
        self.status_code = status_code
        self.retryable = kind in {"rate_limited", "timeout", "unavailable"}
        self.cause = cause


class OpenAIJsonSchemaDefinition(TypedDict):
    name: str
    strict: Literal[True]
    schema: JsonObjectSchema


class OpenAIResponseFormat(TypedDict):
    type: Literal["json_schema"]
    json_schema: OpenAIJsonSchemaDefinition


class OpenAIStructuredPolicy(TypedDict):
    model: str
    temperature: float
    store: Literal[False]
    response_format: OpenAIResponseFormat


class AnthropicToolDefinition(TypedDict):
    name: str
    description: str
    input_schema: JsonObjectSchema


class AnthropicToolChoice(TypedDict):
    type: Literal["tool"]
    name: str


class AnthropicStructuredPolicy(TypedDict):
    model: str
    temperature: float
    tools: list[AnthropicToolDefinition]
    tool_choice: AnthropicToolChoice


def clamp_factual_temperature(temperature: float) -> float:
    if not math.isfinite(temperature):
        raise TypeError("Factual extraction temperature must be a finite number.")
    return min(MAX_FACTUAL_TEMPERATURE, max(0.0, temperature))


def build_openai_structured_policy(
    *,
    model: str,
    temperature: float,
    schema_name: str,
    schema: JsonObjectSchema,
) -> OpenAIStructuredPolicy:
    """Build fields for an OpenAI call with strict JSON Schema output."""

    _assert_policy_input(model, schema_name, schema)
    return {
        "model": model,
        "temperature": clamp_factual_temperature(temperature),
        "store": False,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": True,
                "schema": schema,
            },
        },
    }


def build_anthropic_structured_policy(
    *,
    model: str,
    temperature: float,
    tool_name: str,
    tool_description: str,
    schema: JsonObjectSchema,
) -> AnthropicStructuredPolicy:
    """Build fields that force an Anthropic tool call carrying schema-bound JSON."""

    _assert_policy_input(model, tool_name, schema)
    if not tool_description.strip():
        raise TypeError("Anthropic output tool description is required.")
    return {
        "model": model,
        "temperature": clamp_factual_temperature(temperature),
        "tools": [
            {
                "name": tool_name,
                "description": tool_description,
                "input_schema": schema,
            }
        ],
        "tool_choice": {"type": "tool", "name": tool_name},
    }


def create_openai_structured_chat_model(
    *,
    model: str,
    temperature: float,
    schema_name: str,
    schema: JsonObjectSchema,
    api_key: str | None = None,
    max_tokens: int | None = None,
    streaming: bool = False,
) -> ChatOpenAI:
    """Construct LangChain's OpenAI client with the shared strict policy."""

    from langchain_openai import ChatOpenAI
    from pydantic import SecretStr

    policy = build_openai_structured_policy(
        model=model,
        temperature=temperature,
        schema_name=schema_name,
        schema=schema,
    )
    try:
        return ChatOpenAI(
            model=policy["model"],
            api_key=SecretStr(api_key) if api_key else None,
            temperature=policy["temperature"],
            max_completion_tokens=max_tokens,
            streaming=streaming,
            model_kwargs={
                "response_format": policy["response_format"],
                "store": policy["store"],
            },
        )
    except Exception as error:
        raise classify_provider_error(error) from error


async def create_openai_structured_completion[T](
    create: Callable[..., Awaitable[T]],
    request: Mapping[str, object],
    *,
    model: str,
    temperature: float,
    schema_name: str,
    schema: JsonObjectSchema,
) -> T:
    """Call an async OpenAI-compatible client with mandatory structured policy."""

    policy = build_openai_structured_policy(
        model=model,
        temperature=temperature,
        schema_name=schema_name,
        schema=schema,
    )
    protected_fields = {"model", "temperature", "response_format", "store", "stream"}
    sanitised_request = {
        key: value for key, value in request.items() if key not in protected_fields
    }
    try:
        return await create(**sanitised_request, **policy)
    except Exception as error:
        raise classify_provider_error(error) from error


async def invoke_openai_structured_chat[T](
    invoke: Callable[[object], Awaitable[T]],
    messages: object,
) -> T:
    """Invoke a structured LangChain client and normalise provider failures."""

    try:
        return await invoke(messages)
    except Exception as error:
        raise classify_provider_error(error) from error


async def stream_openai_structured_chat[T](
    stream: Callable[[object], AsyncIterator[T]],
    messages: object,
) -> AsyncIterator[T]:
    """Stream from a structured LangChain client and normalise provider failures."""

    try:
        async for chunk in stream(messages):
            yield chunk
    except Exception as error:
        raise classify_provider_error(error) from error


def parse_structured_output[T](raw: object, parser: Callable[[dict[str, Any]], T]) -> T:
    """Decode provider output and validate it with the feature's runtime schema."""

    try:
        decoded = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(decoded, dict):
            raise TypeError("Structured output must be a JSON object.")
        return parser(decoded)
    except ProviderFailure:
        raise
    except (TypeError, ValueError) as error:
        raise ProviderFailure("invalid_output", cause=error) from error


def classify_provider_error(error: BaseException) -> ProviderFailure:
    if isinstance(error, ProviderFailure):
        return error

    status_code = _read_status_code(error)
    if status_code == 429:
        return ProviderFailure("rate_limited", status_code=status_code, cause=error)
    if _is_timeout(error):
        return ProviderFailure("timeout", status_code=status_code, cause=error)
    if status_code is not None and status_code >= 500:
        return ProviderFailure("unavailable", status_code=status_code, cause=error)
    return ProviderFailure("provider_error", status_code=status_code, cause=error)


def to_safe_provider_failure(surface: str, error: BaseException) -> SafeProviderFailure:
    """Return the only provider-failure fields allowed across an API boundary."""

    failure = classify_provider_error(error)
    http_status: Literal[429, 502, 503]
    if failure.kind == "rate_limited":
        http_status = 429
    elif failure.kind == "invalid_output":
        http_status = 502
    else:
        http_status = 503
    return {
        "surface": surface,
        "kind": failure.kind,
        "message": str(failure),
        "http_status": http_status,
        "retryable": failure.retryable,
    }


def _assert_policy_input(model: str, schema_name: str, schema: JsonObjectSchema) -> None:
    if not model.strip():
        raise TypeError("AI model is required.")
    if not schema_name.strip():
        raise TypeError("Structured output schema name is required.")
    if schema.get("type") != "object":
        raise TypeError("Structured output schema must describe a JSON object.")
    _assert_strict_object_schemas(schema, schema_name)


def _assert_strict_object_schemas(value: object, path: str) -> None:
    if isinstance(value, list):
        for index, item in enumerate(value):
            _assert_strict_object_schemas(item, f"{path}[{index}]")
        return
    if not isinstance(value, dict):
        return

    if value.get("type") == "object":
        if value.get("additionalProperties") is not False:
            raise TypeError(f"{path} must set additionalProperties to false.")
        properties = value.get("properties")
        required = value.get("required")
        if not isinstance(properties, dict):
            raise TypeError(f"{path} must declare object properties.")
        if not isinstance(required, list):
            raise TypeError(f"{path} must require every object property.")
        required_names = {item for item in required if isinstance(item, str)}
        for property_name in properties:
            if property_name not in required_names:
                raise TypeError(f"{path}.{property_name} must be required.")

    for key, child in value.items():
        if key != "description":
            _assert_strict_object_schemas(child, f"{path}.{key}")


def _read_status_code(error: BaseException) -> int | None:
    for attribute in ("status_code", "status"):
        value = getattr(error, attribute, None)
        if isinstance(value, int):
            return value

    response = getattr(error, "response", None)
    if response is not None:
        for attribute in ("status_code", "status"):
            value = getattr(response, attribute, None)
            if isinstance(value, int):
                return value
    return None


def _is_timeout(error: BaseException) -> bool:
    if isinstance(error, TimeoutError):
        return True
    name = type(error).__name__.lower()
    code = str(getattr(error, "code", "")).upper()
    return (
        name in {"timeouterror", "aborterror", "apiconnectiontimeouterror"}
        or code in {"ETIMEDOUT", "ECONNABORTED"}
        or "TIMEOUT" in code
        or re.search(r"timed?\s*out|timeout", str(error), re.IGNORECASE) is not None
    )
