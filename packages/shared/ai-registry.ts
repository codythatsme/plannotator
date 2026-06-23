/**
 * AI Registry — the single source of truth for *which harnesses exist × which
 * agents (chat / review / tour) they back × their model catalogs × effort
 * vocabularies × defaults × CLI detection*.
 *
 * Plannotator runs two execution stacks that historically each owned a private
 * copy of this truth, causing drift (different model lists, defaults, and labels
 * on the chat / review / tour surfaces). Both stacks now READ this registry:
 *
 *   - interactive chat   → `packages/ai` SDK sessions (streaming SSE)
 *   - batch review/tour  → CLI spawn (claude/codex) OR SDK one-shot (opencode/pi)
 *
 * Defaults are UNIFORM per harness: one default model + effort per engine, used
 * identically by chat, review, and tour.
 *
 * IMPORTANT — runtime-agnostic. This module imports nothing (no `bun`, no
 * `node:*`, no SDK). It is vendored verbatim into the Pi extension's `generated/`
 * tree by `apps/pi-extension/vendor.sh`, so it must stay dependency-free, exactly
 * like the other shared modules in that vendor loop.
 *
 * The `EngineId → Origin` correspondence (e.g. engine `claude` ↔ origin
 * `claude-code`) is asserted in `packages/shared/agents.ts` (where `Origin`
 * lives) via a type-only import of `EngineId`, keeping the two in sync without
 * creating a runtime dependency from this module onto `agents.ts`.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * A batch/CLI engine — keyed by the CLI binary name, NOT the agent origin.
 * Note: engine `claude` corresponds to origin `claude-code` (see agents.ts).
 */
export type EngineId = "claude" | "codex" | "opencode" | "pi";

export const ENGINE_IDS: readonly EngineId[] = ["claude", "codex", "opencode", "pi"];

/** The surfaces an engine can power. */
export type AgentKind = "chat" | "review" | "tour";

// ---------------------------------------------------------------------------
// Effort vocabularies — modeled per-engine so a codex job cannot carry a claude
// effort value and vice-versa (illegal states unrepresentable).
// ---------------------------------------------------------------------------

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type CodexReasoning = "minimal" | "low" | "medium" | "high" | "xhigh";

const CLAUDE_EFFORTS: readonly ClaudeEffort[] = ["low", "medium", "high", "xhigh", "max"];
const CODEX_REASONINGS: readonly CodexReasoning[] = ["minimal", "low", "medium", "high", "xhigh"];

/** Display labels for every effort token across engines (one vocabulary). */
const EFFORT_LABELS: Readonly<Record<string, string>> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
};

export function effortLabel(value: string): string {
  return EFFORT_LABELS[value] ?? value;
}

/** An effort option as rendered in a dropdown. */
export interface EffortOption {
  readonly id: string;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export interface ModelEntry {
  readonly id: string;
  readonly label: string;
  readonly default?: true;
  /**
   * The value to pass to the engine's CLI `--model` flag, when it differs from
   * the canonical `id`. Omitted = pass the canonical id verbatim (the current
   * claude/codex CLIs accept full versioned ids).
   */
  readonly cliFlag?: string;
}

/**
 * How an engine's model list is sourced.
 *  - `static`: a fixed catalog declared here (claude, codex).
 *  - `dynamic`: fetched at runtime from the provider (opencode, pi). "No
 *    dropdown" is therefore a represented state, not an implicit one.
 */
export type ModelCatalog =
  | { readonly kind: "static"; readonly entries: readonly ModelEntry[] }
  | { readonly kind: "dynamic" };

// ---------------------------------------------------------------------------
// Execution shape — how a given (agent, engine) actually runs.
// ---------------------------------------------------------------------------

export type ExecShape =
  /** Chat → a `packages/ai` SDK session, streamed over SSE. */
  | { readonly kind: "streaming"; readonly providerType: string }
  /** Review/Tour → spawn the engine's CLI to a schema-validated blob (existing). */
  | { readonly kind: "batch-cli"; readonly adapterId: "claude" | "codex" }
  /** Review/Tour → run the SDK session one-shot, tolerantly parse findings JSON. */
  | { readonly kind: "batch-sdk"; readonly providerType: string };

// ---------------------------------------------------------------------------
// Harness — an engine plus everything the registry knows about it.
// Modeled as a discriminated union over `id` so each engine carries ONLY its
// legal effort/model/default shape.
// ---------------------------------------------------------------------------

interface HarnessBase {
  /** The CLI binary used for availability detection (`which <cliBin>`). */
  readonly cliBin: string;
  /** Display name shown in batch capability lists (e.g. "Claude Code"). */
  readonly displayName: string;
  /** Which agents this engine backs, and how each runs. */
  readonly agents: Partial<Record<AgentKind, ExecShape>>;
}

export type HarnessConfig =
  | (HarnessBase & {
      readonly id: "claude";
      readonly catalog: { readonly kind: "static"; readonly entries: readonly ModelEntry[] };
      readonly efforts: readonly ClaudeEffort[];
      readonly defaultModelId: string;
      readonly defaultEffort: ClaudeEffort;
      readonly supportsFastMode: false;
    })
  | (HarnessBase & {
      readonly id: "codex";
      readonly catalog: { readonly kind: "static"; readonly entries: readonly ModelEntry[] };
      readonly efforts: readonly CodexReasoning[];
      readonly defaultModelId: string;
      readonly defaultEffort: CodexReasoning;
      readonly supportsFastMode: true;
    })
  | (HarnessBase & {
      readonly id: "opencode";
      readonly catalog: { readonly kind: "dynamic" };
      readonly supportsFastMode: false;
    })
  | (HarnessBase & {
      readonly id: "pi";
      readonly catalog: { readonly kind: "dynamic" };
      readonly supportsFastMode: false;
    });

// ---------------------------------------------------------------------------
// THE REGISTRY
//
// Seeded to encode TODAY'S reality verbatim (claude/codex catalogs match the SDK
// provider lists; opencode/pi expose chat only). Later phases extend opencode/pi
// with review/tour `batch-sdk` exec shapes and modernize the catalogs.
// ---------------------------------------------------------------------------

export const HARNESSES = {
  claude: {
    id: "claude",
    cliBin: "claude",
    displayName: "Claude Code",
    catalog: {
      kind: "static",
      entries: [
        { id: "claude-sonnet-4-6", label: "Sonnet 4.6", default: true },
        { id: "claude-sonnet-4-6[1m]", label: "Sonnet 4.6 (1M)" },
        { id: "claude-opus-4-7", label: "Opus 4.7" },
        { id: "claude-opus-4-7[1m]", label: "Opus 4.7 (1M)" },
        { id: "claude-opus-4-6", label: "Opus 4.6" },
        { id: "claude-opus-4-6[1m]", label: "Opus 4.6 (1M)" },
        { id: "claude-haiku-4-5", label: "Haiku 4.5" },
      ],
    },
    efforts: CLAUDE_EFFORTS,
    defaultModelId: "claude-sonnet-4-6",
    defaultEffort: "high",
    supportsFastMode: false,
    agents: {
      chat: { kind: "streaming", providerType: "claude-agent-sdk" },
      review: { kind: "batch-cli", adapterId: "claude" },
      tour: { kind: "batch-cli", adapterId: "claude" },
    },
  },
  codex: {
    id: "codex",
    cliBin: "codex",
    displayName: "Codex CLI",
    catalog: {
      kind: "static",
      entries: [
        { id: "gpt-5.5", label: "GPT-5.5" },
        { id: "gpt-5.4", label: "GPT-5.4", default: true },
        { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
        { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
        { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" },
        { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
        { id: "gpt-5.2", label: "GPT-5.2" },
      ],
    },
    efforts: CODEX_REASONINGS,
    defaultModelId: "gpt-5.4",
    defaultEffort: "high",
    supportsFastMode: true,
    agents: {
      chat: { kind: "streaming", providerType: "codex-sdk" },
      review: { kind: "batch-cli", adapterId: "codex" },
      tour: { kind: "batch-cli", adapterId: "codex" },
    },
  },
  opencode: {
    id: "opencode",
    cliBin: "opencode",
    displayName: "OpenCode",
    catalog: { kind: "dynamic" },
    supportsFastMode: false,
    // Chat only for now. Review/tour (`batch-sdk`) are wired in a later phase
    // once the SDK one-shot batch path + findings parser exist.
    agents: {
      chat: { kind: "streaming", providerType: "opencode-sdk" },
    },
  },
  pi: {
    id: "pi",
    cliBin: "pi",
    displayName: "Pi",
    catalog: { kind: "dynamic" },
    supportsFastMode: false,
    agents: {
      chat: { kind: "streaming", providerType: "pi-sdk" },
    },
  },
} as const satisfies { readonly [E in EngineId]: Extract<HarnessConfig, { id: E }> };

// ---------------------------------------------------------------------------
// Pure accessors / resolvers (no I/O)
// ---------------------------------------------------------------------------

export function getHarness<E extends EngineId>(id: E): (typeof HARNESSES)[E] {
  return HARNESSES[id];
}

export function isEngineId(value: string): value is EngineId {
  return value === "claude" || value === "codex" || value === "opencode" || value === "pi";
}

/** All harnesses, in canonical order. */
export function listHarnesses(): readonly HarnessConfig[] {
  return ENGINE_IDS.map((id) => HARNESSES[id]);
}

/** Engines that back a given agent surface, with their exec shape. */
export function harnessesForAgent(
  kind: AgentKind,
): readonly { readonly harness: HarnessConfig; readonly exec: ExecShape }[] {
  const out: { harness: HarnessConfig; exec: ExecShape }[] = [];
  for (const id of ENGINE_IDS) {
    const harness: HarnessConfig = HARNESSES[id];
    const exec = harness.agents[kind];
    if (exec) out.push({ harness, exec });
  }
  return out;
}

function staticEntries(harness: HarnessConfig): readonly ModelEntry[] | null {
  return harness.catalog.kind === "static" ? harness.catalog.entries : null;
}

/** The uniform default model id for an engine (undefined for dynamic engines). */
export function defaultModelId(id: EngineId): string | undefined {
  const harness = HARNESSES[id];
  return "defaultModelId" in harness ? harness.defaultModelId : undefined;
}

/** The uniform default effort for an engine (undefined for engines with none). */
export function defaultEffort(id: EngineId): string | undefined {
  const harness = HARNESSES[id];
  return "defaultEffort" in harness ? harness.defaultEffort : undefined;
}

/** The effort options for an engine (null = no effort selector). */
export function effortsFor(id: EngineId): readonly EffortOption[] | null {
  const harness = HARNESSES[id];
  if (!("efforts" in harness)) return null;
  return harness.efforts.map((value) => ({ id: value, label: effortLabel(value) }));
}

/** True when `raw` is a known static model id for the engine. */
export function isKnownModel(id: EngineId, raw: string): boolean {
  const entries = staticEntries(HARNESSES[id]);
  if (entries === null) return raw.length > 0; // dynamic — can't validate; accept non-empty
  return entries.some((m) => m.id === raw);
}

/**
 * Boundary validator for an incoming model selection. Returns the matching
 * `ModelEntry` for static engines, a passthrough entry for dynamic engines, or
 * `null` when the value is invalid (never throws, never casts).
 */
export function parseModelSelection(id: EngineId, raw: unknown): ModelEntry | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const entries = staticEntries(HARNESSES[id]);
  if (entries === null) return { id: raw, label: raw }; // dynamic passthrough
  return entries.find((m) => m.id === raw) ?? null;
}

/** Boundary validator for an incoming effort value. */
export function parseEffort(id: EngineId, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const harness = HARNESSES[id];
  if (!("efforts" in harness)) return null;
  const ok = (harness.efforts as readonly string[]).includes(raw);
  return ok ? raw : null;
}

/**
 * Map a canonical model id to the value the engine's CLI expects on `--model`.
 * Returns `undefined` to mean "let the CLI pick its own default" — which also
 * structurally encodes "don't send a model the engine doesn't know" (e.g. a
 * claude model id must never reach the codex CLI).
 */
export function toCliModel(id: EngineId, modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  const entries = staticEntries(HARNESSES[id]);
  if (entries === null) return modelId; // dynamic — passthrough
  const entry = entries.find((m) => m.id === modelId);
  if (!entry) return undefined;
  return entry.cliFlag ?? entry.id;
}

// ---------------------------------------------------------------------------
// Serialization — the JSON slice embedded in both /api/ai/capabilities and
// /api/agents/capabilities so every UI surface renders from one shape.
// ---------------------------------------------------------------------------

export interface SerializedModel {
  readonly id: string;
  readonly label: string;
  readonly default?: boolean;
}

export interface SerializedEngine {
  readonly engine: EngineId;
  /** null = dynamic (models fetched at runtime by the provider). */
  readonly models: readonly SerializedModel[] | null;
  /** null = no effort selector for this engine. */
  readonly efforts: readonly EffortOption[] | null;
  readonly supportsFastMode: boolean;
  readonly defaultModelId: string | null;
  readonly defaultEffort: string | null;
  /** Which agent surfaces this engine backs. */
  readonly agents: readonly AgentKind[];
}

export function serializeEngine(id: EngineId): SerializedEngine {
  const harness: HarnessConfig = HARNESSES[id];
  const entries = staticEntries(harness);
  const agents = (["chat", "review", "tour"] as const).filter((k) => harness.agents[k] !== undefined);
  return {
    engine: id,
    models: entries === null ? null : entries.map((m) => ({ id: m.id, label: m.label, ...(m.default && { default: true }) })),
    efforts: effortsFor(id),
    supportsFastMode: harness.supportsFastMode,
    defaultModelId: defaultModelId(id) ?? null,
    defaultEffort: defaultEffort(id) ?? null,
    agents,
  };
}

export function serializeRegistry(): readonly SerializedEngine[] {
  return ENGINE_IDS.map(serializeEngine);
}

// ---------------------------------------------------------------------------
// Batch capabilities — the review-mode provider list for /api/agents/capabilities.
// Structurally compatible with @plannotator/shared/agent-jobs `AgentCapability`
// (kept dependency-free here so this module imports nothing).
// ---------------------------------------------------------------------------

export interface BatchCapability {
  /** Engine id, or the meta-provider id `"tour"`. */
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
}

/** Meta-provider id + display name for Code Tour. */
export const TOUR_PROVIDER_ID = "tour";
export const TOUR_PROVIDER_NAME = "Code Tour";

/**
 * Build the review-mode batch capability list from the registry, injecting the
 * runtime's `which` (Bun.which on Bun, an execFileSync shim on Node/Pi). This is
 * the single source for both the Bun and Pi agent-jobs handlers, replacing the
 * previously-duplicated hardcoded `[claude, codex, tour]` arrays.
 *
 * Engines that back the `review` agent appear as their own capability; Tour is a
 * single meta-provider available when any of its engines is present. Engines
 * without a `review`/`tour` exec shape (opencode/pi today) simply don't appear.
 */
export function computeBatchCapabilities(opts: {
  which: (bin: string) => boolean;
}): BatchCapability[] {
  const { which } = opts;
  const reviewers: BatchCapability[] = harnessesForAgent("review").map(({ harness }) => ({
    id: harness.id,
    name: harness.displayName,
    available: which(harness.cliBin),
  }));
  const tourEngines = harnessesForAgent("tour");
  const tour: BatchCapability = {
    id: TOUR_PROVIDER_ID,
    name: TOUR_PROVIDER_NAME,
    available: tourEngines.some(({ harness }) => which(harness.cliBin)),
  };
  return tourEngines.length > 0 ? [...reviewers, tour] : reviewers;
}
