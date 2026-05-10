import { useCallback, useEffect, useState } from 'react';
import { getItem, setItem } from '../utils/storage';
import type { AgentEngine } from '../utils/agentCatalog';

export type { AgentEngine };

const COOKIE_KEY = 'plannotator.agents';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-7';
export const DEFAULT_CLAUDE_EFFORT = 'high';
export const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex';
export const DEFAULT_CODEX_REASONING = 'high';
export const DEFAULT_CODEX_FAST = false;

interface ClaudeSection {
  model: string;
  perModel: Record<string, { effort: string }>;
}

interface CodexSection {
  model: string;
  perModel: Record<string, { reasoning: string; fast: boolean }>;
}

export type AgentAction = 'review' | 'tour';

export interface AgentSettingsState {
  selectedAction: AgentAction;
  engine: AgentEngine;
  claude: ClaudeSection;
  codex: CodexSection;
}

const initialState: AgentSettingsState = {
  selectedAction: 'review',
  engine: 'claude',
  claude: { model: DEFAULT_CLAUDE_MODEL, perModel: {} },
  codex: { model: DEFAULT_CODEX_MODEL, perModel: {} },
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

function readCookie(): AgentSettingsState {
  const raw = getItem(COOKIE_KEY);
  if (!raw) return initialState;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return initialState;
    // Migrate older cookies that stored separate per-action engine selections.
    const legacyEngine = parsed.reviewEngine === 'codex' || parsed.tourEngine === 'codex' ? 'codex' : 'claude';
    return {
      selectedAction: parsed.selectedAction === 'tour' ? 'tour' : 'review',
      engine: parsed.engine === 'codex' || parsed.engine === 'claude' ? parsed.engine : legacyEngine,
      claude: {
        model: typeof parsed.claude?.model === 'string' ? parsed.claude.model : DEFAULT_CLAUDE_MODEL,
        perModel: parsed.claude?.perModel ?? {},
      },
      codex: {
        model: typeof parsed.codex?.model === 'string' ? parsed.codex.model : DEFAULT_CODEX_MODEL,
        perModel: sanitizeCodexPerModel(parsed.codex?.perModel),
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

  const setSelectedAction = useCallback((selectedAction: AgentAction) => {
    setState((s) => ({ ...s, selectedAction }));
  }, []);

  const setEngine = useCallback((engine: AgentEngine) => {
    setState((s) => ({ ...s, engine }));
  }, []);

  const setClaudeModel = useCallback((model: string) => {
    setState((s) => ({ ...s, claude: { ...s.claude, model } }));
  }, []);

  const setClaudeEffort = useCallback((effort: string) => {
    setState((s) => {
      const prev = s.claude.perModel[s.claude.model] ?? { effort: '' };
      return {
        ...s,
        claude: {
          ...s.claude,
          perModel: { ...s.claude.perModel, [s.claude.model]: { ...prev, effort } },
        },
      };
    });
  }, []);

  const setCodexModel = useCallback((model: string) => {
    setState((s) => ({ ...s, codex: { ...s.codex, model } }));
  }, []);

  const patchCodex = useCallback(
    (patch: Partial<{ reasoning: string; fast: boolean }>) => {
      setState((s) => {
        const prev = s.codex.perModel[s.codex.model] ?? { reasoning: DEFAULT_CODEX_REASONING, fast: DEFAULT_CODEX_FAST };
        return {
          ...s,
          codex: {
            ...s.codex,
            perModel: { ...s.codex.perModel, [s.codex.model]: { ...prev, ...patch } },
          },
        };
      });
    },
    [],
  );

  const setCodexReasoning = useCallback((reasoning: string) => patchCodex({ reasoning }), [patchCodex]);
  const setCodexFast = useCallback((fast: boolean) => patchCodex({ fast }), [patchCodex]);

  const claudeEffort = state.claude.perModel[state.claude.model]?.effort ?? DEFAULT_CLAUDE_EFFORT;
  const codexReasoning = state.codex.perModel[state.codex.model]?.reasoning ?? DEFAULT_CODEX_REASONING;
  const codexFast = state.codex.perModel[state.codex.model]?.fast ?? DEFAULT_CODEX_FAST;

  return {
    selectedAction: state.selectedAction,
    engine: state.engine,
    claudeModel: state.claude.model,
    claudeEffort,
    codexModel: state.codex.model,
    codexReasoning,
    codexFast,
    setSelectedAction,
    setEngine,
    setClaudeModel,
    setClaudeEffort,
    setCodexModel,
    setCodexReasoning,
    setCodexFast,
  };
}
