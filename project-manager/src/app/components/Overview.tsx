interface PipelineData {
  project: {
    name: string;
    code: string;
    created: string;
  };
  software: {
    houdini: string;
    karma: string;
    usd: string;
  };
  team: string[];
  assets: any[];
  sets: any[];
  shots: any[];
  conventions?: {
    valid_statuses: string[];
  };
}

interface OverviewProps {
  data: PipelineData | null;
}

export function Overview({ data }: OverviewProps) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <p>Load a JSON file to view project overview</p>
      </div>
    );
  }

  const getShotDependencies = () => {
    const dependencies: Record<string, Set<string>> = {};

    data.shots.forEach((shot) => {
      const shotName = shot.name;
      dependencies[shotName] = new Set();

      Object.entries(shot.tasks || {}).forEach(([taskName, task]: [string, any]) => {
        if (task.notes) {
          const setMatches = task.notes.match(/set_\w+/g);
          if (setMatches) {
            setMatches.forEach((setName: string) => dependencies[shotName].add(setName));
          }
        }
      });
    });

    return dependencies;
  };

  const dependencies = getShotDependencies();
  const shotsBySequence = data.shots.reduce((acc: Record<string, any[]>, shot: any) => {
    const sequenceMatch = shot.name?.match(/^([a-zA-Z0-9]+)_/);
    const sequenceName = sequenceMatch ? sequenceMatch[1] : 'misc';
    if (!acc[sequenceName]) {
      acc[sequenceName] = [];
    }
    acc[sequenceName].push(shot);
    return acc;
  }, {});
  const sortedSequences = Object.entries(shotsBySequence).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900">
        <h2 className="text-xl font-medium text-white">Project Overview</h2>
      </div>

      <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Project Info</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="text-xs text-zinc-500">Name</div>
              <div className="text-sm text-white">{data.project.name}</div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-zinc-500">Code</div>
              <div className="text-sm text-white">{data.project.code}</div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-zinc-500">Created</div>
              <div className="text-sm text-white">{data.project.created}</div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Software</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="text-xs text-zinc-500">Houdini</div>
              <div className="text-sm text-white">{data.software.houdini}</div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-zinc-500">Karma</div>
              <div className="text-sm text-white">{data.software.karma}</div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-zinc-500">USD</div>
              <div className="text-sm text-white">{data.software.usd}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-2xl font-medium text-white mb-0.5">{data.team.length}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Team</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-2xl font-medium text-white mb-0.5">{data.assets.length}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Assets</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-2xl font-medium text-white mb-0.5">{data.sets.length}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Sets</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <div className="text-2xl font-medium text-white mb-0.5">{data.shots.length}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Shots</div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 mb-3">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Team Members</h3>
        <div className="flex flex-wrap gap-1.5">
          {data.team.map((member) => (
            <div key={member} className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
              {member}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 mb-3">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Shots & Sequences</h3>
        <div className="space-y-2">
          {sortedSequences.map(([sequence, sequenceShots]) => (
            <div key={sequence} className="border border-zinc-800 rounded bg-zinc-950/70 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs text-zinc-300 uppercase tracking-wide font-medium">{sequence}</div>
                <div className="text-xs text-zinc-500">{sequenceShots.length} shots</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sequenceShots.map((shot: any) => (
                  <span
                    key={shot.name}
                    className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-400 font-mono"
                  >
                    {shot.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {sortedSequences.length === 0 && (
            <div className="text-xs text-zinc-600">No shots found.</div>
          )}
        </div>
      </div>

      {Object.keys(dependencies).some(shot => dependencies[shot].size > 0) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Set Dependencies</h3>
          <div className="space-y-1.5">
            {Object.entries(dependencies).map(([shot, sets]) => {
              if (sets.size === 0) return null;
              return (
                <div key={shot} className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 min-w-20 font-mono">{shot}</span>
                  <span className="text-zinc-600">→</span>
                  <div className="flex gap-1.5">
                    {Array.from(sets).map((set) => (
                      <span key={set} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400">
                        {set}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
