import { Upload } from 'lucide-react';

interface TopBarProps {
  onLoadJson: (event: React.ChangeEvent<HTMLInputElement>) => void;
  projectName?: string;
}

export function TopBar({ onLoadJson, projectName }: TopBarProps) {
  return (
    <div className="h-14 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        {projectName && (
          <div className="text-sm text-zinc-500">
            Project: <span className="font-medium text-white">{projectName}</span>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 px-4 py-2 bg-zinc-700 text-white rounded cursor-pointer hover:bg-zinc-600 transition-colors text-sm font-medium">
        <Upload size={16} />
        <span>Load JSON</span>
        <input
          type="file"
          accept=".json"
          onChange={onLoadJson}
          className="hidden"
        />
      </label>
    </div>
  );
}
