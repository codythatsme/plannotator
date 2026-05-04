import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_CODEX_REASONING,
  normalizeAgentSettings,
  sanitizeCodexPerModel,
} from "./useAgentSettings";

describe("sanitizeCodexPerModel", () => {
  test("returns empty object for undefined/empty input", () => {
    expect(sanitizeCodexPerModel(undefined)).toEqual({});
    expect(sanitizeCodexPerModel({})).toEqual({});
  });

  test("drops stale reasoning: 'none' entry when fast is false", () => {
    const result = sanitizeCodexPerModel({
      "gpt-5.3-codex": { reasoning: "none", fast: false },
    });
    expect(result).toEqual({});
  });

  test("retains entry with reasoning: 'none' but fast: true, replacing reasoning with default", () => {
    const result = sanitizeCodexPerModel({
      "gpt-5.3-codex": { reasoning: "none", fast: true },
    });
    expect(result).toEqual({
      "gpt-5.3-codex": { reasoning: DEFAULT_CODEX_REASONING, fast: true },
    });
  });

  test("passes through valid entries unchanged", () => {
    const input = {
      "gpt-5.3-codex": { reasoning: "high", fast: false },
      "gpt-5.3-pro": { reasoning: "medium", fast: true },
    };
    expect(sanitizeCodexPerModel(input)).toEqual(input);
  });

  test("skips non-object entries", () => {
    const input = {
      valid: { reasoning: "high", fast: false },
      nullish: null as unknown as { reasoning: string; fast: boolean },
      stringy: "bad" as unknown as { reasoning: string; fast: boolean },
    };
    expect(sanitizeCodexPerModel(input)).toEqual({
      valid: { reasoning: "high", fast: false },
    });
  });
});

describe("normalizeAgentSettings", () => {
  test("migrates legacy claude provider selection to code review with Claude engine", () => {
    const result = normalizeAgentSettings({ selectedProvider: "claude" });
    expect(result.selectedAction).toBe("review");
    expect(result.reviewEngine).toBe("claude");
    expect(result.tourEngine).toBe("claude");
  });

  test("migrates legacy codex provider selection to code review with Codex engine", () => {
    const result = normalizeAgentSettings({ selectedProvider: "codex" });
    expect(result.selectedAction).toBe("review");
    expect(result.reviewEngine).toBe("codex");
    expect(result.tourEngine).toBe("claude");
  });

  test("migrates legacy tour provider selection to code tour and preserves tour engine", () => {
    const result = normalizeAgentSettings({ selectedProvider: "tour", tourEngine: "codex" });
    expect(result.selectedAction).toBe("tour");
    expect(result.reviewEngine).toBe("claude");
    expect(result.tourEngine).toBe("codex");
  });

  test("defaults invalid or missing selection to code review with Claude engine", () => {
    expect(normalizeAgentSettings(null).selectedAction).toBe("review");
    expect(normalizeAgentSettings(null).reviewEngine).toBe("claude");

    const result = normalizeAgentSettings({
      selectedProvider: "shell",
      selectedAction: "unknown",
      reviewEngine: "other",
      claude: { model: 42 },
    });
    expect(result.selectedAction).toBe("review");
    expect(result.reviewEngine).toBe("claude");
    expect(result.claude.model).toBe(DEFAULT_CLAUDE_MODEL);
  });
});
