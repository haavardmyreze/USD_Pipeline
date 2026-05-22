import { normalizeStatus, statusLabel, statusStyles } from '../lib/statuses';

interface StatusBadgeProps {
  status?: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const key = normalizeStatus(status);
  const config =
    key === 'unknown'
      ? { label: statusLabel(key), className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' }
      : { label: statusStyles[key].label, className: statusStyles[key].badgeClass };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
