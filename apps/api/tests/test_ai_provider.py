from __future__ import annotations

import math

import pytest

from app.platform.ai.provider import (
    ProviderFailure,
    build_anthropic_structured_policy,
    build_openai_structured_policy,
    clamp_factual_temperature,
    classify_provider_error,
    create_openai_structured_chat_model,
    create_openai_structured_completion,
    parse_structured_output,
)

OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["answer"],
    "properties": {"answer": {"type": "string"}},
}


def test_clamps_factual_temperature_to_zero_through_point_two() -> None:
    assert clamp_factual_temperature(-1) == 0
    assert clamp_factual_temperature(0.1) == 0.1
    assert clamp_factual_temperature(1) == 0.2
    with pytest.raises(TypeError, match="finite number"):
        clamp_factual_temperature(math.nan)


def test_builds_strict_openai_json_schema_policy_without_changing_model() -> None:
    policy = build_openai_structured_policy(
        model="gpt-4o-mini",
        temperature=0.7,
        schema_name="GroundedAnswer",
        schema=OUTPUT_SCHEMA,
    )

    assert policy["model"] == "gpt-4o-mini"
    assert policy["temperature"] == 0.2
    assert policy["store"] is False
    assert policy["response_format"] == {
        "type": "json_schema",
        "json_schema": {
            "name": "GroundedAnswer",
            "strict": True,
            "schema": OUTPUT_SCHEMA,
        },
    }


def test_builds_forced_anthropic_tool_use_policy_without_provider_sdk() -> None:
    policy = build_anthropic_structured_policy(
        model="claude-sonnet-4",
        temperature=0.1,
        tool_name="return_grounded_answer",
        tool_description="Return the grounded answer.",
        schema=OUTPUT_SCHEMA,
    )

    assert policy["model"] == "claude-sonnet-4"
    assert policy["temperature"] == 0.1
    assert policy["tool_choice"] == {"type": "tool", "name": "return_grounded_answer"}
    assert policy["tools"][0]["input_schema"] == OUTPUT_SCHEMA


def test_langchain_openai_model_inherits_shared_structured_policy() -> None:
    model = create_openai_structured_chat_model(
        model="gpt-4o",
        temperature=0.8,
        schema_name="GroundedAnswer",
        schema=OUTPUT_SCHEMA,
        api_key="test-key",
        max_tokens=250,
    )

    assert model.model_name == "gpt-4o"
    assert model.temperature == 0.2
    assert model.max_tokens == 250
    assert model.model_kwargs["response_format"]["type"] == "json_schema"
    assert model.model_kwargs["store"] is False


async def test_openai_client_wrapper_always_applies_strict_policy() -> None:
    captured: dict[str, object] = {}

    async def create(**kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"id": "completion-1"}

    await create_openai_structured_completion(
        create,
        {
            "messages": [{"role": "user", "content": "Ground this"}],
            "model": "caller-model",
            "temperature": 1.0,
            "store": True,
        },
        model="gpt-4o-mini",
        temperature=1,
        schema_name="GroundedAnswer",
        schema=OUTPUT_SCHEMA,
    )

    assert captured["model"] == "gpt-4o-mini"
    assert captured["temperature"] == 0.2
    assert captured["store"] is False
    assert captured["response_format"] == {
        "type": "json_schema",
        "json_schema": {
            "name": "GroundedAnswer",
            "strict": True,
            "schema": OUTPUT_SCHEMA,
        },
    }


def test_rejects_json_schemas_that_can_accept_extra_fields() -> None:
    with pytest.raises(TypeError, match="additionalProperties"):
        build_openai_structured_policy(
            model="gpt-4o-mini",
            temperature=0.1,
            schema_name="Loose",
            schema={
                "type": "object",
                "properties": {"answer": {"type": "string"}},
                "required": [],
            },
        )


def test_accepts_validated_json_objects_and_rejects_free_text() -> None:
    def parse_answer(value: dict[str, object]) -> dict[str, str]:
        answer = value.get("answer")
        if not isinstance(answer, str):
            raise ValueError("answer is required")
        return {"answer": answer}

    assert parse_structured_output('{"answer":"Grounded"}', parse_answer) == {
        "answer": "Grounded"
    }
    with pytest.raises(ProviderFailure) as captured:
        parse_structured_output("unstructured answer", parse_answer)
    assert captured.value.kind == "invalid_output"


class FakeProviderError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, code: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def test_classifies_rate_limits_timeouts_and_provider_500s_without_raw_detail() -> None:
    rate_limit = classify_provider_error(
        FakeProviderError("secret upstream detail", status_code=429)
    )
    timeout = classify_provider_error(FakeProviderError("request failed", code="ETIMEDOUT"))
    unavailable = classify_provider_error(
        FakeProviderError("internal provider trace", status_code=503)
    )

    assert rate_limit.kind == "rate_limited"
    assert rate_limit.status_code == 429
    assert timeout.kind == "timeout"
    assert unavailable.kind == "unavailable"
    assert unavailable.status_code == 503
    assert "internal provider trace" not in str(unavailable)
