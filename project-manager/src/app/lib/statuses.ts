/** Matches USD Publisher HDA status menu: WIP, Ready, Final */
export const PIPELINE_STATUSES = ['wip', 'ready', 'final'] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

const LEGACY_MAP: Record<string, PipelineStatus> = {
  wip: 'wip',
  ready: 'ready',
  final: 'final',
  in_progress: 'wip',
  not_started: 'wip',
  published: 'final',
};

export function normalizeStatus(value?: string): PipelineStatus | 'unknown' {
  if (!value) return 'unknown';
  const key = value.trim().toLowerCase();
  return LEGACY_MAP[key] || (PIPELINE_STATUSES.includes(key as PipelineStatus) ? (key as PipelineStatus) : 'unknown');
}

export function statusLabel(status: PipelineStatus | 'unknown'): string {
  if (status === 'wip') return 'WIP';
  if (status === 'ready') return 'Ready';
  if (status === 'final') return 'Final';
  return 'Unknown';
}

export const statusStyles: Record<
  PipelineStatus,
  { label: string; badgeClass: string; filterActive: string; filterInactive: string; dotClass: string }
> = {
  wip: {
    label: 'WIP',
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    filterActive: 'bg-amber-500/20 text-amber-400 border-amber-500',
    filterInactive: 'bg-zinc-800 text-zinc-600 border-zinc-700',
    dotClass: 'bg-amber-500',
  },
  ready: {
    label: 'Ready',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    filterActive: 'bg-blue-500/20 text-blue-400 border-blue-500',
    filterInactive: 'bg-zinc-800 text-zinc-600 border-zinc-700',
    dotClass: 'bg-blue-500',
  },
  final: {
    label: 'Final',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    filterActive: 'bg-emerald-500/20 text-emerald-400 border-emerald-500',
    filterInactive: 'bg-zinc-800 text-zinc-600 border-zinc-700',
    dotClass: 'bg-emerald-500',
  },
};
