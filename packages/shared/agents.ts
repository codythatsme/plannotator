/**
 * Centralized agent configuration — single source of truth for all supported agents.
 *
 * To add a new agent:
 *   1. Add an entry to AGENT_CONFIG below (origin key, display name, badge CSS classes,
 *      optional AI provider types)
 *   2. If detection is via environment variable, add it to the detection chain
 *      in apps/hook/server/index.ts (detectedOrigin constant)
 *   3. That's it — all UI components read from this config automatically
 */

// Type-only import — erased at runtime, so this does NOT create a runtime
// dependency from agents.ts onto ai-registry.ts (which is vendored standalone).
import type { EngineId } from "./ai-registry";

type AgentConfigEntry = {
  name: string;
  badge: string;
  /** AI provider type(s) that naturally match this origin, in preference order. */
  aiProviderTypes?: readonly string[];
};

export const AGENT_CONFIG = {
  'claude-code': { name: 'Claude Code', badge: 'bg-orange-500/15 text-orange-400', aiProviderTypes: ['claude-agent-sdk'] },
  'amp':         { name: 'Amp',         badge: 'bg-lime-500/15 text-lime-400' },
  'droid':       { name: 'Droid',       badge: 'bg-cyan-500/15 text-cyan-400' },
  'opencode':    { name: 'OpenCode',    badge: 'bg-emerald-500/15 text-emerald-400', aiProviderTypes: ['opencode-sdk'] },
  'copilot-cli': { name: 'GitHub Copilot', badge: 'bg-blue-500/15 text-blue-400' },
  'pi':          { name: 'Pi',          badge: 'bg-violet-500/15 text-violet-400', aiProviderTypes: ['pi-sdk'] },
  'codex':       { name: 'Codex',       badge: 'bg-purple-500/15 text-purple-400', aiProviderTypes: ['codex-sdk'] },
  'gemini-cli':  { name: 'Gemini CLI', badge: 'bg-sky-500/15 text-sky-400' },
} as const satisfies Record<string, AgentConfigEntry>;

/** All recognized origin values. */
export type Origin = keyof typeof AGENT_CONFIG;

/** Resolve an origin to a human-readable agent name. */
export function getAgentName(origin: Origin | null | undefined): string {
  if (origin && origin in AGENT_CONFIG) return AGENT_CONFIG[origin as Origin].name;
  return 'Coding Agent';
}

/** Resolve an origin to Tailwind badge classes. */
export function getAgentBadge(origin: Origin | null | undefined): string {
  if (origin && origin in AGENT_CONFIG) return AGENT_CONFIG[origin as Origin].badge;
  return 'bg-zinc-500/20 text-zinc-400';
}

/** Resolve an origin to matching AI provider types, in preference order. */
export function getAgentAIProviderTypes(origin: Origin | null | undefined): readonly string[] {
  if (origin && origin in AGENT_CONFIG) {
    const config = AGENT_CONFIG[origin as Origin];
    return 'aiProviderTypes' in config ? config.aiProviderTypes : [];
  }
  return [];
}

/**
 * Maps each batch/CLI engine (ai-registry `EngineId`) to its agent origin.
 * The `satisfies Record<EngineId, Origin>` assertion guarantees every engine's
 * origin is a real AGENT_CONFIG key, keeping the registry's engine space in sync
 * with the origin space at compile time. Note engine `claude` ↔ origin
 * `claude-code`.
 */
export const ENGINE_TO_ORIGIN = {
  claude: 'claude-code',
  codex: 'codex',
  opencode: 'opencode',
  pi: 'pi',
} as const satisfies Record<EngineId, Origin>;

/** Resolve a batch engine to its origin. */
export function originForEngine(engine: EngineId): Origin {
  return ENGINE_TO_ORIGIN[engine];
}
