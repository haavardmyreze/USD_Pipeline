import { useState } from 'react';
import { StatusBadge } from './StatusBadge';
import {
  collectSetColumnKeys,
  getSetTask,
  SET_REQUIRED_FLAT_COLUMNS,
  type PipelineTask,
} from '../lib/setTasks';

interface PipelineData {
  assets: any[];
  sets: any[];
  shots: any[];
  library: {
    materials?: string[];
  };
}

interface WorkspaceProps {
  data: PipelineData | null;
}

const tabs = [
  { id: 'assets', label: 'Assets' },
  { id: 'sets', label: 'Sets' },
  { id: 'shots', label: 'Shots' },
  { id: 'library', label: 'Library' },
];

const taskDefinitions = {
  assets: ['model', 'rig', 'lookdev', 'assembly'],
  shots: ['layout', 'anim', 'lighting'],
};

type TaskColumn =
  | { key: string; label: string; kind: 'flat' }
  | { key: string; label: string; kind: 'block' };

function renderTaskDetails(task: PipelineTask) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-zinc-600 w-16">Artist:</span>
        <span className="text-zinc-300">{task.artist}</span>
      </div>
      {task.status && (
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 w-16">Status:</span>
          <StatusBadge status={task.status} />
        </div>
      )}
      {task.hip_file && (
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 w-16">HIP File:</span>
          <span className="font-mono text-zinc-400">{task.hip_file}</span>
        </div>
      )}
      {task.published_at && (
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 w-16">Published:</span>
          <span className="text-zinc-500">{task.published_at}</span>
        </div>
      )}
      {task.notes && (
        <div className="flex gap-2">
          <span className="text-zinc-600 w-16">Notes:</span>
          <span className="text-zinc-500 flex-1">{task.notes}</span>
        </div>
      )}
    </div>
  );
}

function resolveEntityTask(entity: any, column: TaskColumn, tab: string): PipelineTask | undefined {
  if (tab === 'sets') {
    return getSetTask(entity.tasks, column.key, column.kind);
  }
  return entity.tasks?.[column.key];
}

const artistStatusColors = {
  wip: 'text-amber-400',
  ready: 'text-blue-400',
  final: 'text-emerald-400',
};

const assetGroupColors: Record<string, string> = {
  char: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  prop: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  env: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  vehicle: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  fx: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  crowd: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  other: 'bg-zinc-800 text-zinc-300 border-zinc-700',
};

const sequencePalette = [
  'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  'bg-violet-500/15 text-violet-300 border-violet-500/30',
  'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  'bg-pink-500/15 text-pink-300 border-pink-500/30',
  'bg-rose-500/15 text-rose-300 border-rose-500/30',
  'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'bg-lime-500/15 text-lime-300 border-lime-500/30',
  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  'bg-sky-500/15 text-sky-300 border-sky-500/30',
];

export function PipelineWorkspace({ data }: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState('assets');
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <p>Load a JSON file to view pipeline workspace</p>
      </div>
    );
  }

  const toggleEntity = (entityName: string) => {
    setExpandedEntity(expandedEntity === entityName ? null : entityName);
  };

  const getCount = (tabId: string) => {
    if (tabId === 'assets') return data.assets.length;
    if (tabId === 'sets') return data.sets.length;
    if (tabId === 'shots') return data.shots.length;
    if (tabId === 'library') return data.library.materials?.length || 0;
    return 0;
  };

  const getAssetType = (assetName: string) => {
    const match = assetName.match(/^([a-z]+)_/);
    return match ? match[1] : 'other';
  };

  const getSequence = (shotName: string) => {
    const match = shotName.match(/^([a-z]+)_/);
    return match ? match[1] : 'other';
  };

  const getStableIndex = (value: string, size: number) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash % size;
  };

  const getGroupBadgeClass = (groupName: string) => {
    if (activeTab === 'assets') {
      return assetGroupColors[groupName] || assetGroupColors.other;
    }

    if (activeTab === 'shots') {
      const paletteIndex = getStableIndex(groupName.toLowerCase(), sequencePalette.length);
      return sequencePalette[paletteIndex];
    }

    return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  };

  const renderContent = () => {
    if (activeTab === 'library') {
      return (
        <div className="p-4">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Materials Library</h3>
          <div className="space-y-1">
            {data.library.materials?.map((material) => (
              <div key={material} className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-300">
                {material}
              </div>
            ))}
          </div>
        </div>
      );
    }

    let entities = activeTab === 'assets' ? data.assets : activeTab === 'sets' ? data.sets : data.shots;
    const setColumnKeys = activeTab === 'sets' ? collectSetColumnKeys(data.sets) : null;
    const taskColumns: TaskColumn[] =
      activeTab === 'sets' && setColumnKeys
        ? [
            ...setColumnKeys.flat
              .filter((key) => key !== 'assembly')
              .map((key) => ({ key, label: key, kind: 'flat' as const })),
            ...setColumnKeys.blocks.map((key) => ({ key, label: key, kind: 'block' as const })),
            ...SET_REQUIRED_FLAT_COLUMNS.map((key) => ({ key, label: key, kind: 'flat' as const })),
          ]
        : (taskDefinitions[activeTab as keyof typeof taskDefinitions] || []).map((key) => ({
            key,
            label: key,
            kind: 'flat' as const,
          }));

    let groupedEntities: Record<string, any[]> = {};
    if (activeTab === 'assets') {
      entities.forEach((entity: any) => {
        const type = getAssetType(entity.name);
        if (!groupedEntities[type]) {
          groupedEntities[type] = [];
        }
        groupedEntities[type].push(entity);
      });
    } else if (activeTab === 'shots') {
      entities.forEach((entity: any) => {
        const seq = getSequence(entity.name);
        if (!groupedEntities[seq]) {
          groupedEntities[seq] = [];
        }
        groupedEntities[seq].push(entity);
      });
    } else {
      groupedEntities['all'] = entities;
    }

    return (
      <div className="p-4">
        <div className="space-y-4">
        {Object.entries(groupedEntities).map(([groupName, groupEntities]) => (
          <div key={groupName}>
            {groupName !== 'all' && (
              <div className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs uppercase tracking-wide mb-1">
                <span className={`inline-flex px-2 py-0.5 rounded border text-xs ${getGroupBadgeClass(groupName)}`}>
                  {groupName}
                </span>
              </div>
            )}
            <div
              className="grid gap-3 px-3 py-1.5 bg-zinc-900/70 border border-zinc-800 rounded text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1"
              style={{ gridTemplateColumns: `minmax(200px, 1fr) repeat(${taskColumns.length}, minmax(120px, 1fr))` }}
            >
              <div>Entity</div>
              {taskColumns.map((column) => (
                <div
                  key={`${column.kind}-${column.key}`}
                  className={column.kind === 'block' ? 'text-cyan-500/80' : undefined}
                  title={column.kind === 'block' ? 'Block' : undefined}
                >
                  {column.label}
                </div>
              ))}
            </div>

            <div className="space-y-1">
            {groupEntities.map((entity: any) => {
              const isExpanded = expandedEntity === entity.name;

              return (
                <div key={entity.name}>
                  <button
                    onClick={() => toggleEntity(entity.name)}
                    className={`group w-full grid gap-3 items-center px-3 py-2 border border-zinc-800 rounded text-xs text-left transition-colors bg-zinc-900 ${
                      expandedEntity && !isExpanded
                        ? 'opacity-55 hover:opacity-75 hover:border-zinc-700'
                        : 'opacity-100 hover:border-zinc-700'
                    }`}
                    style={{ gridTemplateColumns: `minmax(200px, 1fr) repeat(${taskColumns.length}, minmax(120px, 1fr))` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-300 truncate">{entity.name}</span>
                      <span
                        className={`text-[10px] uppercase tracking-wide transition-opacity ${
                          isExpanded
                            ? 'text-zinc-400 opacity-100'
                            : 'text-zinc-500 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                        }`}
                      >
                        {isExpanded ? 'Hide details' : 'Expand'}
                      </span>
                    </div>
                    {taskColumns.map((column) => {
                      const task = resolveEntityTask(entity, column, activeTab);
                      const artistClass = task?.status
                        ? artistStatusColors[task.status as keyof typeof artistStatusColors] || 'text-zinc-300'
                        : 'text-zinc-500';
                      return (
                        <div key={`${column.kind}-${column.key}`} className={`${artistClass} truncate`}>
                          {task ? task.artist : '—'}
                        </div>
                      );
                    })}
                  </button>

                  {isExpanded && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded mt-1 px-4 py-3">
                      <div className="space-y-3">
                        {taskColumns.map((column) => {
                          const task = resolveEntityTask(entity, column, activeTab);
                          const label = column.kind === 'block' ? `blocks / ${column.label}` : column.label;
                          return (
                            <div key={`${column.kind}-${column.key}`} className="border-b border-zinc-900 pb-3 last:border-0 last:pb-0">
                              <div className="text-xs text-zinc-400 uppercase tracking-wide mb-2">{label}</div>
                              {task ? renderTaskDetails(task) : (
                                <div className="text-xs text-zinc-700">Not started</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 pt-4">
        <h2 className="text-xl font-medium text-white mb-3">Pipeline Workspace</h2>
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const count = getCount(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-sm rounded-t transition-colors ${
                  activeTab === tab.id
                    ? 'bg-zinc-950 text-white border-t border-x border-zinc-800'
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs text-zinc-600">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-zinc-950">
        {renderContent()}
      </div>
    </div>
  );
}
