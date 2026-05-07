import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

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
  status: 'wip' | 'ready' | 'final';
  notes: string;
}

export function Artists({ data }: ArtistsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilters, setStatusFilters] = useState<Set<'wip' | 'ready' | 'final'>>(new Set(['wip', 'ready', 'final']));
  const [expandedArtist, setExpandedArtist] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <p>Load a JSON file to view artist tasks</p>
      </div>
    );
  }

  const toggleArtist = (artist: string) => {
    setExpandedArtist(expandedArtist === artist ? null : artist);
  };

  const toggleStatusFilter = (status: 'wip' | 'ready' | 'final') => {
    const newFilters = new Set(statusFilters);
    if (newFilters.has(status)) {
      newFilters.delete(status);
    } else {
      newFilters.add(status);
    }
    setStatusFilters(newFilters);
  };

  const allTasks = useMemo(() => {
    const tasks: TaskEntry[] = [];

    data.assets.forEach((asset) => {
      Object.entries(asset.tasks || {}).forEach(([step, task]: [string, any]) => {
        tasks.push({
          artist: task.artist,
          type: 'asset',
          entity: asset.name,
          step,
          hipFile: task.hip_file,
          status: task.status,
          notes: task.notes || '',
        });
      });
    });

    data.sets.forEach((set) => {
      Object.entries(set.tasks || {}).forEach(([step, task]: [string, any]) => {
        tasks.push({
          artist: task.artist,
          type: 'set',
          entity: set.name,
          step,
          hipFile: task.hip_file,
          status: task.status,
          notes: task.notes || '',
        });
      });
    });

    data.shots.forEach((shot) => {
      Object.entries(shot.tasks || {}).forEach(([step, task]: [string, any]) => {
        tasks.push({
          artist: task.artist,
          type: 'shot',
          entity: shot.name,
          step,
          hipFile: task.hip_file,
          status: task.status,
          notes: task.notes || '',
        });
      });
    });

    return tasks;
  }, [data]);

  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      const matchesSearch =
        searchQuery === '' ||
        task.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.entity.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === 'all' || task.type === typeFilter;
      const matchesStatus = statusFilters.has(task.status);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [allTasks, searchQuery, typeFilter, statusFilters]);

  const tasksByArtist = useMemo(() => {
    const grouped: Record<string, TaskEntry[]> = {};
    filteredTasks.forEach((task) => {
      if (!grouped[task.artist]) {
        grouped[task.artist] = [];
      }
      grouped[task.artist].push(task);
    });
    return grouped;
  }, [filteredTasks]);

  const typeColors = {
    asset: 'bg-purple-50 text-purple-700 border-purple-200',
    set: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    shot: 'bg-orange-50 text-orange-700 border-orange-200',
  };

  const statusConfig = {
    wip: { label: 'WIP', activeClass: 'bg-amber-500/20 text-amber-400 border-amber-500', inactiveClass: 'bg-zinc-800 text-zinc-600 border-zinc-700' },
    ready: { label: 'Ready', activeClass: 'bg-blue-500/20 text-blue-400 border-blue-500', inactiveClass: 'bg-zinc-800 text-zinc-600 border-zinc-700' },
    final: { label: 'Final', activeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500', inactiveClass: 'bg-zinc-800 text-zinc-600 border-zinc-700' },
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900">
        <h2 className="text-xl font-medium text-white mb-3">Artist Tasks</h2>

        <div className="flex gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="Search by artist name or entity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-600"
          >
            <option value="all">All Types</option>
            <option value="asset">Assets</option>
            <option value="set">Sets</option>
            <option value="shot">Shots</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Status:</span>
          <div className="flex gap-1.5">
            {(Object.keys(statusConfig) as Array<'wip' | 'ready' | 'final'>).map((status) => {
              const config = statusConfig[status];
              const isActive = statusFilters.has(status);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatusFilter(status)}
                  className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                    isActive ? config.activeClass : config.inactiveClass
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
        {Object.entries(tasksByArtist).map(([artist, tasks]) => {
          const isExpanded = expandedArtist === artist;

          return (
            <div key={artist}>
              <button
                onClick={() => toggleArtist(artist)}
                className="w-full px-3 py-2 bg-zinc-900 hover:bg-zinc-850 border-b border-zinc-800 text-left flex items-center gap-2 transition-colors text-sm"
              >
                <span className="font-medium text-white">{artist}</span>
                <span className="text-zinc-500 text-xs">({tasks.length})</span>
              </button>

              {isExpanded && (
                <div className="bg-zinc-950 px-3 py-2">
                  <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wide rounded-t">
                    <div>Type</div>
                    <div>Entity</div>
                    <div>Step</div>
                    <div>HIP File</div>
                    <div>Status</div>
                    <div>Notes</div>
                  </div>
                  {tasks.map((task, index) => {
                    const hasNotes = task.notes.trim() !== '';
                    return (
                      <div key={index} className={`grid grid-cols-6 gap-2 px-3 py-2 border-b border-zinc-800 text-xs hover:bg-zinc-900 transition-colors ${index % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/30'}`}>
                        <div>
                          <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${typeColors[task.type]}`}>
                            {task.type}
                          </span>
                        </div>
                        <div className="text-zinc-300">{task.entity}</div>
                        <div className="text-zinc-300">{task.step}</div>
                        <div className="font-mono text-zinc-400 truncate">{task.hipFile}</div>
                        <div>
                          <StatusBadge status={task.status} />
                        </div>
                        <div className="text-zinc-400 truncate">
                          {hasNotes ? task.notes : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(tasksByArtist).length === 0 && (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <p>No tasks found matching your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
