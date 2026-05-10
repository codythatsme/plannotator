// Catalog of agent engine options, shared across the launcher UI and the job
// detail panel so model/effort labels stay consistent everywhere.

export type AgentEngine = 'claude' | 'codex';

export interface CatalogOption {
  value: string;
  label: string;
}

export const CLAUDE_MODELS: ReadonlyArray<CatalogOption> = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-sonnet-4-6[1m]', label: 'Sonnet 4.6 (1M)' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-opus-4-7[1m]', label: 'Opus 4.7 (1M)' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-opus-4-6[1m]', label: 'Opus 4.6 (1M)' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

export const CLAUDE_EFFORT: ReadonlyArray<CatalogOption> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'max', label: 'Max' },
];

export const CODEX_MODELS: ReadonlyArray<CatalogOption> = [
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark' },
  { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
  { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
];

export const CODEX_REASONING: ReadonlyArray<CatalogOption> = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
];

export const ENGINE_LABEL: Record<AgentEngine, string> = {
  claude: 'Claude',
  codex: 'Codex',
};

function catalogLabel(list: ReadonlyArray<CatalogOption>, value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

export function formatModel(engine: AgentEngine, model: string): string {
  return catalogLabel(engine === 'codex' ? CODEX_MODELS : CLAUDE_MODELS, model);
}

export function formatEffort(value: string): string {
  return catalogLabel(CLAUDE_EFFORT, value);
}

export function formatReasoning(value: string): string {
  return catalogLabel(CODEX_REASONING, value);
}

// Jobs only carry an explicit `engine` when the provider is "tour" (which
// dispatches to either Claude or Codex). For provider-bound jobs the engine
// is implied by the provider name. Centralising the inference keeps badge
// rendering free of provider/engine special cases.
export function inferEngine(provider: string, engine?: string): AgentEngine {
  if (engine === 'claude' || engine === 'codex') return engine;
  return provider === 'codex' ? 'codex' : 'claude';
}
