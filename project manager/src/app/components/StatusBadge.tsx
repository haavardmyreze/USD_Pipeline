interface StatusBadgeProps {
  status: 'wip' | 'ready' | 'final';
}

const statusConfig = {
  wip: { label: 'WIP', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  ready: { label: 'Ready', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  final: { label: 'Final', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
