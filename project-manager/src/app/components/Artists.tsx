import { useState, useMemo, useEffect } from 'react';
import { StatusBadge } from './StatusBadge';
import { iterateEntityTasks } from '../lib/entityTasks';
import { normalizeStatus, PIPELINE_STATUSES, statusStyles, type PipelineStatus } from '../lib/statuses';

interface PipelineData {
  assets: any[];
  sets: any[];
  shots: any[];
  team: string[];
}

interface ArtistsProps {
  data: PipelineData | null;
}

interface TaskEntry {
  artist: string;
  type: 'asset' | 'set' | 'shot';
  entity: string;
  step: string;
  hipFile: string;
  status: PipelineStatus | 'unknown';
  notes: string;
}

export function Artists({ data }: ArtistsProps) {
  const allTasks = useMemo(() => {
    if (!data) return [];
    const tasks: TaskEntry[] = [];

    const addEntity = (entity: any, type: 'asset' | 'set' | 'shot') => {
      iterateEntityTasks(entity, (step, task) => {
        tasks.push({
          artist: task.artist,
          type,
          entity: entity.name,
          step,
          hipFile: task.hip_file || '',
          status: normalizeStatus(task.status),
          notes: task.notes || '',
        });
      });
    };

    data.assets.forEach((asset) => addEntity(asset, 'asset'));
    data.sets.forEach((set) => addEntity(set, 'set'));
    data.shots.forEach((shot) => addEntity(shot, 'shot'));

    return tasks;
  }, [data]);

  const statusOptions = PIPELINE_STATUSES;

  const [statusFilters, setStatusFilters] = useState<Set<PipelineStatus>>(
    () => new Set(PIPELINE_STATUSES),
  );

  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <p>Load a JSON file to view artist tasks</p>
      </div>
    );
  }

  const toggleStatusFilter = (status: PipelineStatus) => {
    const newFilters = new Set(statusFilters);
    if (newFilters.has(status)) {
      newFilters.delete(status);
    } else {
      newFilters.add(status);
    }
    setStatusFilters(newFilters);
  };

  const artistOptions = useMemo(() => {
    return Array.from(new Set(allTasks.map((task) => task.artist))).sort((a, b) => a.localeCompare(b));
  }, [allTasks]);

  useEffect(() => {
    if (artistOptions.length === 0) {
      setSelectedArtist(null);
      return;
    }
    if (!selectedArtist || !artistOptions.includes(selectedArtist)) {
      setSelectedArtist(artistOptions[0]);
    }
  }, [artistOptions, selectedArtist]);

  const selectedArtistTasks = useMemo(() => {
    if (!selectedArtist) return [];
    return allTasks.filter((task) => task.artist === selectedArtist);
  }, [allTasks, selectedArtist]);

  const filteredTasks = useMemo(() => {
    if (!selectedArtist) return [];
    return allTasks.filter(
      (task) => task.artist === selectedArtist && statusFilters.has(task.status),
    );
  }, [allTasks, selectedArtist, statusFilters]);

  const groupedFilteredTasks = useMemo(() => {
    const grouped: Record<'asset' | 'set' | 'shot', TaskEntry[]> = {
      asset: [],
      set: [],
      shot: [],
    };
    filteredTasks.forEach((task) => {
      grouped[task.type].push(task);
    });
    return grouped;
  }, [filteredTasks]);

  const selectedArtistSummary = useMemo(() => {
    const summary: Record<string, number> = { total: selectedArtistTasks.length, asset: 0, set: 0, shot: 0 };
    PIPELINE_STATUSES.forEach((status) => {
      summary[status] = 0;
    });

    selectedArtistTasks.forEach((task) => {
      if (task.status !== 'unknown') summary[task.status] += 1;
      summary[task.type] += 1;
    });

    return summary;
  }, [selectedArtistTasks]);

  const typeColors = {
    asset: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    set: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    shot: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900">
        <h2 className="text-xl font-medium text-white mb-3">Artist Focus</h2>

        <div className="flex gap-3 mb-3">
          <select
            value={selectedArtist || ''}
            onChange={(e) => setSelectedArtist(e.target.value || null)}
            className="min-w-56 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-600"
          >
            {artistOptions.map((artist) => (
              <option key={artist} value={artist}>
                {artist}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Status:</span>
          <div className="flex gap-1.5 flex-wrap">
            {statusOptions.map((status) => {
              const config = statusStyles[status];
              const isActive = statusFilters.has(status);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatusFilter(status)}
                  className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    isActive ? config.filterActive : config.filterInactive
                  }`}
                >
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-zinc-950">
        {selectedArtist && allTasks.length > 0 ? (
          <div className="p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded p-3 mb-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white">{selectedArtist}</h3>
                <span className="text-xs text-zinc-500">
                  {filteredTasks.length} visible / {selectedArtistSummary.total} total tasks
                </span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                {statusOptions.map((status) => (
                  <div key={status} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300">
                    {statusStyles[status].label}:{' '}
                    <span className="text-zinc-100">{selectedArtistSummary[status] || 0}</span>
                  </div>
                ))}
                <div className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300">
                  Assets: <span className="text-zinc-100">{selectedArtistSummary.asset}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300">
                  Sets: <span className="text-zinc-100">{selectedArtistSummary.set}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300">
                  Shots: <span className="text-zinc-100">{selectedArtistSummary.shot}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(['asset', 'set', 'shot'] as Array<'asset' | 'set' | 'shot'>).map((type) => {
                const tasks = groupedFilteredTasks[type];
                if (tasks.length === 0) return null;

                return (
                  <div key={type}>
                    <div className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-medium uppercase tracking-wide mb-1">
                      <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${typeColors[type]}`}>
                        {type}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-2 px-3 py-1.5 bg-zinc-900/70 border border-zinc-800 rounded text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1">
                      <div>Entity</div>
                      <div>Step</div>
                      <div>HIP File</div>
                      <div>Status</div>
                      <div>Notes</div>
                    </div>
                    <div className="space-y-1">
                      {tasks.map((task, index) => {
                        const hasNotes = task.notes.trim() !== '';
                        return (
                          <div
                            key={`${task.entity}-${task.step}-${index}`}
                            className="grid grid-cols-5 gap-2 items-center px-3 py-2 border border-zinc-800 rounded hover:border-zinc-700 transition-colors text-xs bg-zinc-900"
                          >
                            <div className="text-zinc-300">{task.entity}</div>
                            <div className="text-zinc-300">{task.step}</div>
                            <div className="font-mono text-zinc-400 truncate">{task.hipFile}</div>
                            <div>
                              <StatusBadge status={task.status === 'unknown' ? undefined : task.status} />
                            </div>
                            <div className="text-zinc-400 truncate">{hasNotes ? task.notes : '—'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <p>{allTasks.length === 0 ? 'No tasks in pipeline.json' : 'No artists available'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
