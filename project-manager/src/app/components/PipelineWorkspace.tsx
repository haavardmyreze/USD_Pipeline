import { useState, useMemo } from 'react';
import { StatusBadge } from './StatusBadge';

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
  sets: ['dressing', 'lighting', 'lookdev'],
  shots: ['layout', 'anim', 'lighting'],
};

const artistStatusColors = {
  wip: 'text-amber-400',
  ready: 'text-blue-400',
  final: 'text-emerald-400',
};

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
    const taskColumns = taskDefinitions[activeTab as keyof typeof taskDefinitions] || [];

    // Group assets by type
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
      <div className="p-3">
        <div
          className="grid px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wide"
          style={{ gridTemplateColumns: `minmax(200px, 1fr) repeat(${taskColumns.length}, minmax(120px, 1fr))` }}
        >
          <div>Entity</div>
          {taskColumns.map((task) => (
            <div key={task}>{task}</div>
          ))}
        </div>

        {Object.entries(groupedEntities).map(([groupName, groupEntities]) => (
          <div key={groupName} className="mt-3 first:mt-0 border border-zinc-800 rounded overflow-hidden bg-zinc-950/40">
            {groupName !== 'all' && (
              <div className="px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-xs uppercase tracking-wide">
                <span className="inline-flex px-2 py-0.5 rounded border text-xs bg-zinc-800 text-zinc-300 border-zinc-700">
                  {groupName}
                </span>
              </div>
            )}

            {groupEntities.map((entity: any, entityIndex: number) => {
              const isExpanded = expandedEntity === entity.name;

              return (
                <div key={entity.name}>
                  <button
                    onClick={() => toggleEntity(entity.name)}
                    className={`group w-full grid gap-3 px-3 py-2 hover:bg-zinc-900 border-b border-zinc-800 text-sm text-left transition-colors ${
                      entityIndex % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/30'
                    } ${
                      expandedEntity && !isExpanded
                        ? 'opacity-55 hover:opacity-75'
                        : 'opacity-100'
                    }`}
                    style={{ gridTemplateColumns: `minmax(200px, 1fr) repeat(${taskColumns.length}, minmax(120px, 1fr))` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-200 truncate">{entity.name}</span>
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
                    {taskColumns.map((taskName) => {
                      const task = entity.tasks?.[taskName];
                      const artistClass = task?.status
                        ? artistStatusColors[task.status as keyof typeof artistStatusColors] || 'text-zinc-300'
                        : 'text-zinc-500';
                      return (
                        <div key={taskName} className={`${artistClass} truncate`}>
                          {task ? task.artist : '—'}
                        </div>
                      );
                    })}
                  </button>

                  {isExpanded && (
                    <div className="bg-zinc-950 border-b border-zinc-800 px-4 py-3">
                      <div className="space-y-3">
                        {taskColumns.map((taskName) => {
                          const task = entity.tasks?.[taskName];
                          return (
                            <div key={taskName} className="border-b border-zinc-900 pb-3 last:border-0 last:pb-0">
                              <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">{taskName}</div>
                              {task ? (
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-zinc-600 w-16">Artist:</span>
                                    <span className="text-zinc-300">{task.artist}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-zinc-600 w-16">Status:</span>
                                    <StatusBadge status={task.status} />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-zinc-600 w-16">HIP File:</span>
                                    <span className="font-mono text-zinc-400">{task.hip_file}</span>
                                  </div>
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
                              ) : (
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
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 pt-4">
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
