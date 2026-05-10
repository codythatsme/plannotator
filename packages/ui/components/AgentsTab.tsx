import React, { useState, useEffect, useMemo } from 'react';
import type { AgentJobInfo, AgentCapabilities } from '../types';
import { isTerminalStatus } from '@plannotator/shared/agent-jobs';
import { ReviewAgentsIcon } from './ReviewAgentsIcon';
import { useAgentSettings } from '../hooks/useAgentSettings';
import type { AgentAction, AgentEngine } from '../hooks/useAgentSettings';
import {
  CLAUDE_MODELS,
  CLAUDE_EFFORT,
  CODEX_MODELS,
  CODEX_REASONING,
  ENGINE_LABEL,
  formatModel,
  formatEffort,
  formatReasoning,
  inferEngine,
} from '../utils/agentCatalog';

const ACTION_DROPDOWN_LABEL: Record<AgentAction, string> = {
  review: 'Code review',
  tour: 'Code tour',
};

interface AgentsTabProps {
  jobs: AgentJobInfo[];
  capabilities: AgentCapabilities | null;
  onLaunch: (params: { provider?: string; command?: string[]; label?: string; engine?: string; model?: string; reasoningEffort?: string; effort?: string; fastMode?: boolean }) => void;
  onKillJob: (id: string) => void;
  onKillAll: () => void;
  externalAnnotations: Array<{ source?: string }>;
  onOpenJobDetail?: (jobId: string) => void;
}

// --- Duration display ---

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatDuration(Date.now() - startedAt)}</>;
}

// --- Status badge ---

function StatusBadge({ status }: { status: AgentJobInfo['status'] }) {
  switch (status) {
    case 'starting':
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {status === 'starting' ? 'Starting' : 'Running'}
        </span>
      );
    case 'done':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Done
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Failed
        </span>
      );
    case 'killed':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 110 2h-4a1 1 0 01-1-1z" />
          </svg>
          Killed
        </span>
      );
  }
}

// --- Provider badge ---

function ProviderBadge({ provider, engine, model, effort, reasoningEffort, fastMode }: { provider: string; engine?: string; model?: string; effort?: string; reasoningEffort?: string; fastMode?: boolean }) {
  if (provider !== 'claude' && provider !== 'codex' && provider !== 'tour') {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        Shell
      </span>
    );
  }

  const resolvedEngine = inferEngine(provider, engine);
  const parts: string[] = [];
  parts.push(provider === 'tour' ? `Tour · ${ENGINE_LABEL[resolvedEngine]}` : ENGINE_LABEL[resolvedEngine]);
  if (model) parts.push(formatModel(resolvedEngine, model));
  if (resolvedEngine === 'claude' && effort) parts.push(formatEffort(effort));
  if (resolvedEngine === 'codex' && reasoningEffort) parts.push(formatReasoning(reasoningEffort));
  if (fastMode) parts.push('Fast');

  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
      provider === 'tour' ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'
    }`}>
      {parts.join(' · ')}
    </span>
  );
}

// --- Config row ---

type ConfigField =
  | { kind: 'select'; label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (v: string) => void; disabled?: boolean }
  | { kind: 'checkbox'; label: string; toggleLabel: string; value: boolean; onChange: (v: boolean) => void };

function ConfigRow({ field }: { field: ConfigField }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="font-medium w-14">{field.label}</span>
      {field.kind === 'select' ? (
        <select
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          disabled={field.disabled}
          className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-70"
        >
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={field.value}
            onChange={(e) => field.onChange(e.target.checked)}
            className="w-3 h-3 accent-primary"
          />
          <span className={field.value ? 'text-foreground' : ''}>{field.toggleLabel}</span>
        </label>
      )}
    </div>
  );
}

// --- Job card ---

function JobCard({
  job,
  annotationCount,
  onKill,
  expanded,
  onToggle,
  onViewDetails,
}: {
  job: AgentJobInfo;
  annotationCount: number;
  onKill: () => void;
  expanded: boolean;
  onToggle: () => void;
  onViewDetails?: () => void;
}) {
  const isTerminal = isTerminalStatus(job.status);

  return (
    <div
      className={`group relative p-2.5 rounded border transition-all cursor-pointer ${
        expanded
          ? 'bg-muted/30 border-border/50'
          : 'border-transparent hover:bg-muted/30 hover:border-border/50'
      }`}
      onClick={onViewDetails ? () => onViewDetails() : (isTerminal ? onToggle : undefined)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ProviderBadge provider={job.provider} engine={job.engine} model={job.model} effort={job.effort} reasoningEffort={job.reasoningEffort} fastMode={job.fastMode} />
          <span className="text-xs text-foreground/80 truncate">{job.label}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {annotationCount > 0 && (
            <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {annotationCount}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {isTerminal && job.endedAt
              ? formatDuration(job.endedAt - job.startedAt)
              : <ElapsedTime startedAt={job.startedAt} />
            }
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <StatusBadge status={job.status} />
        <div className="flex items-center gap-1">
          {!isTerminal && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onKill();
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
              title="Kill agent"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Error details — fallback for when dockview detail panel is not available */}
      {!onViewDetails && job.status === 'failed' && job.error && expanded && (
        <div className="mt-2 p-2 rounded bg-destructive/5 border border-destructive/20">
          <pre className="text-[10px] text-destructive/80 whitespace-pre-wrap break-all font-mono leading-relaxed max-h-24 overflow-y-auto">
            {job.error}
          </pre>
        </div>
      )}
    </div>
  );
}

// --- Main component ---

export const AgentsTab: React.FC<AgentsTabProps> = ({
  jobs,
  capabilities,
  onLaunch,
  onKillJob,
  onKillAll,
  externalAnnotations,
  onOpenJobDetail,
}) => {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const {
    selectedAction,
    engine,
    claudeModel,
    claudeEffort,
    codexModel,
    codexReasoning,
    codexFast,
    setSelectedAction,
    setEngine,
    setClaudeModel,
    setClaudeEffort,
    setCodexModel,
    setCodexReasoning,
    setCodexFast,
  } = useAgentSettings();

  const claudeAvailable = capabilities?.providers.some((p) => p.id === 'claude' && p.available) ?? false;
  const codexAvailable = capabilities?.providers.some((p) => p.id === 'codex' && p.available) ?? false;
  const tourAvailable = capabilities?.providers.some((p) => p.id === 'tour' && p.available) ?? false;
  const reviewAvailable = claudeAvailable || codexAvailable;
  const preferredAvailableEngine: AgentEngine | null = claudeAvailable ? 'claude' : codexAvailable ? 'codex' : null;

  const availableActions = useMemo<Array<{ value: AgentAction; label: string }>>(() => {
    const actions: Array<{ value: AgentAction; label: string }> = [];
    if (reviewAvailable) actions.push({ value: 'review', label: ACTION_DROPDOWN_LABEL.review });
    if (tourAvailable) actions.push({ value: 'tour', label: ACTION_DROPDOWN_LABEL.tour });
    return actions;
  }, [reviewAvailable, tourAvailable]);

  const availableEngines = useMemo<Array<{ value: AgentEngine; label: string }>>(() => {
    const engines: Array<{ value: AgentEngine; label: string }> = [];
    if (claudeAvailable) engines.push({ value: 'claude', label: ENGINE_LABEL.claude });
    if (codexAvailable) engines.push({ value: 'codex', label: ENGINE_LABEL.codex });
    return engines;
  }, [claudeAvailable, codexAvailable]);

  const effectiveSelectedAction = availableActions.some((a) => a.value === selectedAction)
    ? selectedAction
    : availableActions[0]?.value ?? selectedAction;
  const effectiveEngine = availableEngines.some((e) => e.value === engine)
    ? engine
    : availableEngines[0]?.value ?? engine;

  // Reconcile cached selections against live capabilities. Runs when
  // capabilities change or the stored selection becomes invalid.
  useEffect(() => {
    if (!capabilities) return;
    if (!reviewAvailable && !tourAvailable) return;

    if (selectedAction === 'review' && !reviewAvailable && tourAvailable) setSelectedAction('tour');
    else if (selectedAction === 'tour' && !tourAvailable && reviewAvailable) setSelectedAction('review');

    if (preferredAvailableEngine) {
      if (engine === 'claude' && !claudeAvailable) setEngine(preferredAvailableEngine);
      else if (engine === 'codex' && !codexAvailable) setEngine(preferredAvailableEngine);
    }
  }, [
    capabilities,
    selectedAction,
    engine,
    reviewAvailable,
    tourAvailable,
    claudeAvailable,
    codexAvailable,
    preferredAvailableEngine,
    setSelectedAction,
    setEngine,
  ]);

  // Annotation counts per job source
  const annotationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ann of externalAnnotations) {
      if (ann.source) {
        counts.set(ann.source, (counts.get(ann.source) ?? 0) + 1);
      }
    }
    return counts;
  }, [externalAnnotations]);

  // Sort: running first, then by startedAt descending
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aRunning = !isTerminalStatus(a.status);
      const bRunning = !isTerminalStatus(b.status);
      if (aRunning !== bRunning) return aRunning ? -1 : 1;
      return b.startedAt - a.startedAt;
    });
  }, [jobs]);

  const runningCount = useMemo(
    () => jobs.filter((j) => !isTerminalStatus(j.status)).length,
    [jobs],
  );

  const configFields: ConfigField[] = effectiveEngine === 'codex'
    ? [
        { kind: 'select', label: 'Model', value: codexModel, options: CODEX_MODELS, onChange: setCodexModel },
        { kind: 'select', label: 'Reasoning', value: codexReasoning, options: CODEX_REASONING, onChange: setCodexReasoning },
        { kind: 'checkbox', label: 'Fast', toggleLabel: 'Fast mode', value: codexFast, onChange: setCodexFast },
      ]
    : [
        { kind: 'select', label: 'Model', value: claudeModel, options: CLAUDE_MODELS, onChange: setClaudeModel },
        { kind: 'select', label: 'Effort', value: claudeEffort, options: CLAUDE_EFFORT, onChange: setClaudeEffort },
      ];

  const handleLaunch = () => {
    const engineParams = effectiveEngine === 'codex'
      ? { model: codexModel, reasoningEffort: codexReasoning, ...(codexFast && { fastMode: true }) }
      : { model: claudeModel, effort: claudeEffort };

    if (effectiveSelectedAction === 'tour') {
      onLaunch({ provider: 'tour', label: 'Code Tour', engine: effectiveEngine, ...engineParams });
    } else {
      onLaunch({ provider: effectiveEngine, label: 'Code Review', ...engineParams });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Launch bar */}
      {availableActions.length > 0 && (
        <div className="p-2 border-b border-border/30">
          <div className="flex items-center gap-1.5">
            {availableActions.length > 1 ? (
              <select
                value={effectiveSelectedAction}
                onChange={(e) => setSelectedAction(e.target.value as AgentAction)}
                className="flex-1 text-xs px-2 py-1.5 rounded bg-muted/50 border border-border/50 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {availableActions.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex-1 text-xs px-2 py-1.5 text-muted-foreground">
                {availableActions[0]?.label ?? ''}
              </span>
            )}
            <button
              onClick={handleLaunch}
              disabled={availableActions.length === 0}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Run
            </button>
          </div>

          <div className="mt-2 space-y-1.5">
            <ConfigRow
              field={{
                kind: 'select',
                label: 'Engine',
                value: effectiveEngine,
                options: availableEngines,
                onChange: (v) => setEngine(v as AgentEngine),
                disabled: availableEngines.length <= 1,
              }}
            />
            {configFields.map((field) => (
              <ConfigRow key={field.label} field={field} />
            ))}
          </div>
        </div>
      )}

      {/* Job list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <ReviewAgentsIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              No agent jobs yet
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Launch an agent to get automated review findings
            </p>
          </div>
        ) : (
          sortedJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              annotationCount={annotationCounts.get(job.source) ?? 0}
              onKill={() => onKillJob(job.id)}
              expanded={expandedJobId === job.id}
              onToggle={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
              onViewDetails={onOpenJobDetail ? () => onOpenJobDetail(job.id) : undefined}
            />
          ))
        )}
      </div>

      {/* Kill All footer */}
      {runningCount >= 2 && (
        <div className="p-2 border-t border-border/50">
          <button
            onClick={onKillAll}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-medium text-destructive hover:bg-destructive/10 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Kill All ({runningCount})
          </button>
        </div>
      )}
    </div>
  );
};
