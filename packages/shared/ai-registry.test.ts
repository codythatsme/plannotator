import { describe, test, expect } from "bun:test";
import {
  ENGINE_IDS,
  isEngineId,
  getHarness,
  listHarnesses,
  harnessesForAgent,
  defaultModelId,
  defaultEffort,
  effortsFor,
  isKnownModel,
  parseModelSelection,
  parseEffort,
  toCliModel,
  serializeRegistry,
  serializeEngine,
  computeBatchCapabilities,
} from "./ai-registry";

describe("ai-registry identity", () => {
  test("ENGINE_IDS are the four engines", () => {
    expect([...ENGINE_IDS]).toEqual(["claude", "codex", "opencode", "pi"]);
  });

  test("isEngineId guards", () => {
    expect(isEngineId("claude")).toBe(true);
    expect(isEngineId("claude-code")).toBe(false); // origin, not engine
    expect(isEngineId("nope")).toBe(false);
  });
});

describe("harnessesForAgent", () => {
  test("chat is backed by all four engines", () => {
    expect(harnessesForAgent("chat").map((h) => h.harness.id)).toEqual([
      "claude",
      "codex",
      "opencode",
      "pi",
    ]);
  });

  test("review/tour are claude+codex only (opencode/pi wired in a later phase)", () => {
    expect(harnessesForAgent("review").map((h) => h.harness.id)).toEqual(["claude", "codex"]);
    expect(harnessesForAgent("tour").map((h) => h.harness.id)).toEqual(["claude", "codex"]);
  });

  test("exec shapes: chat streams, review/tour spawn CLI for claude/codex", () => {
    const review = harnessesForAgent("review");
    for (const { exec } of review) expect(exec.kind).toBe("batch-cli");
    const chat = harnessesForAgent("chat");
    for (const { exec } of chat) expect(exec.kind).toBe("streaming");
  });
});

describe("defaults (uniform per harness)", () => {
  test("claude default is sonnet-4-6 / high", () => {
    expect(defaultModelId("claude")).toBe("claude-sonnet-4-6");
    expect(defaultEffort("claude")).toBe("high");
  });

  test("codex default is gpt-5.4 / high", () => {
    expect(defaultModelId("codex")).toBe("gpt-5.4");
    expect(defaultEffort("codex")).toBe("high");
  });

  test("dynamic engines have no static default model or effort", () => {
    expect(defaultModelId("opencode")).toBeUndefined();
    expect(defaultEffort("opencode")).toBeUndefined();
    expect(defaultModelId("pi")).toBeUndefined();
  });

  test("the declared default model is marked default in the catalog", () => {
    const claude = getHarness("claude");
    const def = claude.catalog.entries.find((m) => m.default);
    expect(def?.id).toBe("claude-sonnet-4-6");
  });
});

describe("effort vocabularies are distinct per engine", () => {
  test("claude has max but no minimal", () => {
    const ids = (effortsFor("claude") ?? []).map((e) => e.id);
    expect(ids).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  test("codex has minimal but tops at xhigh", () => {
    const ids = (effortsFor("codex") ?? []).map((e) => e.id);
    expect(ids).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
  });

  test("dynamic engines expose no effort selector", () => {
    expect(effortsFor("opencode")).toBeNull();
    expect(effortsFor("pi")).toBeNull();
  });

  test("xhigh and max have distinct labels", () => {
    const claude = effortsFor("claude") ?? [];
    expect(claude.find((e) => e.id === "xhigh")?.label).toBe("XHigh");
    expect(claude.find((e) => e.id === "max")?.label).toBe("Max");
  });
});

describe("boundary validation", () => {
  test("parseModelSelection accepts known static ids, rejects unknown", () => {
    expect(parseModelSelection("claude", "claude-sonnet-4-6")?.id).toBe("claude-sonnet-4-6");
    expect(parseModelSelection("claude", "gpt-5.4")).toBeNull(); // wrong engine
    expect(parseModelSelection("codex", "made-up")).toBeNull();
    expect(parseModelSelection("claude", "")).toBeNull();
    expect(parseModelSelection("claude", 42)).toBeNull();
  });

  test("parseModelSelection passes through for dynamic engines", () => {
    expect(parseModelSelection("opencode", "anthropic/claude-x")?.id).toBe("anthropic/claude-x");
    expect(parseModelSelection("opencode", "")).toBeNull();
  });

  test("isKnownModel", () => {
    expect(isKnownModel("codex", "gpt-5.4")).toBe(true);
    expect(isKnownModel("codex", "gpt-5.1-codex-max")).toBe(false); // stale/removed
    expect(isKnownModel("pi", "any-nonempty")).toBe(true); // dynamic accepts non-empty
  });

  test("parseEffort validates per engine", () => {
    expect(parseEffort("claude", "max")).toBe("max");
    expect(parseEffort("claude", "minimal")).toBeNull(); // codex-only
    expect(parseEffort("codex", "minimal")).toBe("minimal");
    expect(parseEffort("codex", "max")).toBeNull(); // claude-only
    expect(parseEffort("opencode", "high")).toBeNull(); // no effort vocab
  });
});

describe("toCliModel — cross-engine safety", () => {
  test("known model returns the id (or cliFlag); unknown returns undefined", () => {
    expect(toCliModel("claude", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(toCliModel("codex", "claude-sonnet-4-6")).toBeUndefined(); // never send claude model to codex
    expect(toCliModel("claude", undefined)).toBeUndefined();
  });

  test("dynamic engines pass the model through verbatim", () => {
    expect(toCliModel("opencode", "anthropic/claude-x")).toBe("anthropic/claude-x");
  });
});

describe("byte-identical chat catalogs (Phase 1 no-regression gate)", () => {
  // These are the exact arrays the SDK providers hardcoded before the registry.
  // If the registry ever diverges, the chat /api/ai/capabilities payload moves —
  // this test fails loudly so the change is intentional.
  const normalize = (entries: readonly { id: string; label: string; default?: true }[]) =>
    entries.map((m) => ({ id: m.id, label: m.label, ...(m.default ? { default: true } : {}) }));

  test("claude catalog matches the pre-registry hardcoded list", () => {
    expect(normalize(getHarness("claude").catalog.entries)).toEqual([
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6", default: true },
      { id: "claude-sonnet-4-6[1m]", label: "Sonnet 4.6 (1M)" },
      { id: "claude-opus-4-7", label: "Opus 4.7" },
      { id: "claude-opus-4-7[1m]", label: "Opus 4.7 (1M)" },
      { id: "claude-opus-4-6", label: "Opus 4.6" },
      { id: "claude-opus-4-6[1m]", label: "Opus 4.6 (1M)" },
      { id: "claude-haiku-4-5", label: "Haiku 4.5" },
    ]);
  });

  test("codex catalog matches the pre-registry hardcoded list", () => {
    expect(normalize(getHarness("codex").catalog.entries)).toEqual([
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.4", label: "GPT-5.4", default: true },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
      { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" },
      { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
      { id: "gpt-5.2", label: "GPT-5.2" },
    ]);
  });
});

describe("computeBatchCapabilities (Phase 3 byte-identical with old [claude,codex,tour])", () => {
  const only = (...present: string[]) => (bin: string) => present.includes(bin);

  test("all CLIs present → claude, codex, tour all available (exact shape)", () => {
    expect(computeBatchCapabilities({ which: () => true })).toEqual([
      { id: "claude", name: "Claude Code", available: true },
      { id: "codex", name: "Codex CLI", available: true },
      { id: "tour", name: "Code Tour", available: true },
    ]);
  });

  test("no CLIs present → all unavailable", () => {
    expect(computeBatchCapabilities({ which: () => false })).toEqual([
      { id: "claude", name: "Claude Code", available: false },
      { id: "codex", name: "Codex CLI", available: false },
      { id: "tour", name: "Code Tour", available: false },
    ]);
  });

  test("tour available when EITHER claude or codex present", () => {
    expect(computeBatchCapabilities({ which: only("claude") })).toEqual([
      { id: "claude", name: "Claude Code", available: true },
      { id: "codex", name: "Codex CLI", available: false },
      { id: "tour", name: "Code Tour", available: true },
    ]);
    expect(computeBatchCapabilities({ which: only("codex") }).find((c) => c.id === "tour")?.available).toBe(true);
  });
});

describe("serialization", () => {
  test("static engines serialize their catalog; dynamic serialize null models", () => {
    const claude = serializeEngine("claude");
    expect(claude.models?.length).toBe(7);
    expect(claude.models?.find((m) => m.default)?.id).toBe("claude-sonnet-4-6");
    expect(serializeEngine("opencode").models).toBeNull();
  });

  test("serializeRegistry covers every engine and reports backed agents", () => {
    const all = serializeRegistry();
    expect(all.map((e) => e.engine)).toEqual(["claude", "codex", "opencode", "pi"]);
    expect(serializeEngine("claude").agents).toEqual(["chat", "review", "tour"]);
    expect(serializeEngine("opencode").agents).toEqual(["chat"]);
  });

  test("every harness is listed", () => {
    expect(listHarnesses().map((h) => h.id)).toEqual(["claude", "codex", "opencode", "pi"]);
  });
});
