import { useCallback, useEffect, useState } from 'react';
import { getItem, setItem } from '../utils/storage';
import { defaultModelId, defaultEffort, isKnownModel } from '@plannotator/shared/ai-registry';

const COOKIE_KEY = 'plannotator.agents';

// Defaults sourced from the central AI registry (single source of truth).
// Uniform per harness: tour shares review's default model + effort.
export const DEFAULT_CLAUDE_MODEL = defaultModelId('claude') ?? 'claude-sonnet-4-6';
export const DEFAULT_CLAUDE_EFFORT = defaultEffort('claude') ?? 'high';
export const DEFAULT_CODEX_MODEL = defaultModelId('codex') ?? 'gpt-5.4';
export const DEFAULT_CODEX_REASONING = defaultEffort('codex') ?? 'high';
export const DEFAULT_CODEX_FAST = false;
export const DEFAULT_TOUR_CLAUDE_MODEL = DEFAULT_CLAUDE_MODEL;
export const DEFAULT_TOUR_CLAUDE_EFFORT = DEFAULT_CLAUDE_EFFORT;
export const DEFAULT_TOUR_CODEX_MODEL = DEFAULT_CODEX_MODEL;
export const DEFAULT_TOUR_CODEX_REASONING = DEFAULT_CODEX_REASONING;
export const DEFAULT_TOUR_CODEX_FAST = false;

// Cookie migration: map legacy bare aliases ('sonnet'/'opus') and deprecated
// model ids stored in old cookies onto canonical registry ids, falling back to
// the default when the id is no longer in the catalog.
function migrateClaudeModel(model: string): string {
  if (model === 'sonnet') return DEFAULT_CLAUDE_MODEL;
  if (model === 'opus') return 'claude-opus-4-7';
  return model;
}
function resolveClaudeModel(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return DEFAULT_CLAUDE_MODEL;
  const migrated = migrateClaudeModel(raw);
  return isKnownModel('claude', migrated) ? migrated : DEFAULT_CLAUDE_MODEL;
}
function resolveCodexModel(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return DEFAULT_CODEX_MODEL;
  return isKnownModel('codex', raw) ? raw : DEFAULT_CODEX_MODEL;
}

interface ClaudeSection {
  model: string;
  perModel: Record<string, { effort: string }>;
}

interface CodexSection {
  model: string;
  perModel: Record<string, { reasoning: string; fast: boolean }>;
}

export type AgentMode = 'review' | 'tour';
export type AgentEngine = 'claude' | 'codex';

interface AgentSettingsState {
  selectedMode?: AgentMode;
  reviewEngine: AgentEngine;
  tourEngine: AgentEngine;
  claude: ClaudeSection;
  codex: CodexSection;
  tourClaude: ClaudeSection;
  tourCodex: CodexSection;
}

const initialState: AgentSettingsState = {
  selectedMode: 'review',
  reviewEngine: 'claude',
  tourEngine: 'claude',
  claude: { model: DEFAULT_CLAUDE_MODEL, perModel: {} },
  codex: { model: DEFAULT_CODEX_MODEL, perModel: {} },
  tourClaude: { model: DEFAULT_TOUR_CLAUDE_MODEL, perModel: {} },
  tourCodex: { model: DEFAULT_TOUR_CODEX_MODEL, perModel: {} },
};

// One-shot migration: drop any cached "none" codex reasoning entries. The
// dropdown no longer offers "None" (codex-rs rejects it as a config value);
// fall back to the default instead of shipping an invalid flag.
export function sanitizeCodexPerModel(
  perModel: Record<string, { reasoning: string; fast: boolean }> | undefined,
): Record<string, { reasoning: string; fast: boolean }> {
  if (!perModel) return {};
  const out: Record<string, { reasoning: string; fast: boolean }> = {};
  for (const [model, entry] of Object.entries(perModel)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.reasoning === 'none') {
      if (entry.fast) out[model] = { reasoning: DEFAULT_CODEX_REASONING, fast: true };
      continue;
    }
    out[model] = entry;
  }
  return out;
}

function parseEngine(value: unknown): AgentEngine {
  return value === 'codex' ? 'codex' : 'claude';
}

function parseMode(value: unknown): AgentMode | undefined {
  if (value === 'review' || value === 'tour') return value;
  return undefined;
}

function readCookie(): AgentSettingsState {
  const raw = getItem(COOKIE_KEY);
  if (!raw) return initialState;
  try {
    const parsed = JSON.parse(raw);
    return {
      selectedMode: parseMode(parsed.selectedMode) ?? initialState.selectedMode,
      reviewEngine: parseEngine(parsed.reviewEngine),
      tourEngine: parseEngine(parsed.tourEngine),
      claude: {
        model: resolveClaudeModel(parsed.claude?.model),
        perModel: parsed.claude?.perModel ?? {},
      },
      codex: {
        model: resolveCodexModel(parsed.codex?.model),
        perModel: sanitizeCodexPerModel(parsed.codex?.perModel),
      },
      tourClaude: {
        model: resolveClaudeModel(parsed.tourClaude?.model),
        perModel: parsed.tourClaude?.perModel ?? {},
      },
      tourCodex: {
        model: resolveCodexModel(parsed.tourCodex?.model),
        perModel: sanitizeCodexPerModel(parsed.tourCodex?.perModel),
      },
    };
  } catch {
    return initialState;
  }
}

export function useAgentSettings() {
  const [state, setState] = useState<AgentSettingsState>(readCookie);

  useEffect(() => {
    setItem(COOKIE_KEY, JSON.stringify(state));
  }, [state]);

  const setSelectedMode = useCallback((mode: AgentMode) => {
    setState((s) => ({ ...s, selectedMode: mode }));
  }, []);

  const setReviewEngine = useCallback((engine: AgentEngine) => {
    setState((s) => ({ ...s, reviewEngine: engine }));
  }, []);

  const setTourEngine = useCallback((engine: AgentEngine) => {
    setState((s) => ({ ...s, tourEngine: engine }));
  }, []);

  const setClaudeModel = useCallback((model: string) => {
    setState((s) => ({ ...s, claude: { ...s.claude, model } }));
  }, []);

  const patchClaude = useCallback(
    (section: 'claude' | 'tourClaude', patch: Partial<{ effort: string }>) => {
      setState((s) => {
        const cur = s[section];
        const prev = cur.perModel[cur.model] ?? { effort: '' };
        return {
          ...s,
          [section]: {
            ...cur,
            perModel: { ...cur.perModel, [cur.model]: { ...prev, ...patch } },
          },
        };
      });
    },
    [],
  );

  const setClaudeEffort = useCallback(
    (effort: string) => patchClaude('claude', { effort }),
    [patchClaude],
  );

  const setCodexModel = useCallback((model: string) => {
    setState((s) => ({ ...s, codex: { ...s.codex, model } }));
  }, []);

  const patchCodex = useCallback(
    (
      section: 'codex' | 'tourCodex',
      patch: Partial<{ reasoning: string; fast: boolean }>,
      defaults: { reasoning: string; fast: boolean },
    ) => {
      setState((s) => {
        const cur = s[section];
        const prev = cur.perModel[cur.model] ?? defaults;
        return {
          ...s,
          [section]: {
            ...cur,
            perModel: { ...cur.perModel, [cur.model]: { ...prev, ...patch } },
          },
        };
      });
    },
    [],
  );

  const setCodexReasoning = useCallback(
    (reasoning: string) => patchCodex('codex', { reasoning }, { reasoning: DEFAULT_CODEX_REASONING, fast: DEFAULT_CODEX_FAST }),
    [patchCodex],
  );
  const setCodexFast = useCallback(
    (fast: boolean) => patchCodex('codex', { fast }, { reasoning: DEFAULT_CODEX_REASONING, fast: DEFAULT_CODEX_FAST }),
    [patchCodex],
  );

  const setTourClaudeModel = useCallback((model: string) => {
    setState((s) => ({ ...s, tourClaude: { ...s.tourClaude, model } }));
  }, []);

  const setTourClaudeEffort = useCallback(
    (effort: string) => patchClaude('tourClaude', { effort }),
    [patchClaude],
  );

  const setTourCodexModel = useCallback((model: string) => {
    setState((s) => ({ ...s, tourCodex: { ...s.tourCodex, model } }));
  }, []);

  const setTourCodexReasoning = useCallback(
    (reasoning: string) => patchCodex('tourCodex', { reasoning }, { reasoning: DEFAULT_TOUR_CODEX_REASONING, fast: DEFAULT_TOUR_CODEX_FAST }),
    [patchCodex],
  );
  const setTourCodexFast = useCallback(
    (fast: boolean) => patchCodex('tourCodex', { fast }, { reasoning: DEFAULT_TOUR_CODEX_REASONING, fast: DEFAULT_TOUR_CODEX_FAST }),
    [patchCodex],
  );

  const claudeEffort = state.claude.perModel[state.claude.model]?.effort ?? DEFAULT_CLAUDE_EFFORT;
  const codexReasoning = state.codex.perModel[state.codex.model]?.reasoning ?? DEFAULT_CODEX_REASONING;
  const codexFast = state.codex.perModel[state.codex.model]?.fast ?? DEFAULT_CODEX_FAST;
  const tourClaudeEffort = state.tourClaude.perModel[state.tourClaude.model]?.effort ?? DEFAULT_TOUR_CLAUDE_EFFORT;
  const tourCodexReasoning = state.tourCodex.perModel[state.tourCodex.model]?.reasoning ?? DEFAULT_TOUR_CODEX_REASONING;
  const tourCodexFast = state.tourCodex.perModel[state.tourCodex.model]?.fast ?? DEFAULT_TOUR_CODEX_FAST;

  return {
    selectedMode: state.selectedMode,
    reviewEngine: state.reviewEngine,
    tourEngine: state.tourEngine,
    claudeModel: state.claude.model,
    claudeEffort,
    codexModel: state.codex.model,
    codexReasoning,
    codexFast,
    tourClaudeModel: state.tourClaude.model,
    tourClaudeEffort,
    tourCodexModel: state.tourCodex.model,
    tourCodexReasoning,
    tourCodexFast,
    setSelectedMode,
    setReviewEngine,
    setTourEngine,
    setClaudeModel,
    setClaudeEffort,
    setCodexModel,
    setCodexReasoning,
    setCodexFast,
    setTourClaudeModel,
    setTourClaudeEffort,
    setTourCodexModel,
    setTourCodexReasoning,
    setTourCodexFast,
  };
}
