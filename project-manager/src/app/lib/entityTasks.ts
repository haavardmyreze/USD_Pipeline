export const BLOCKS_KEY = 'blocks';
export const ASSEMBLY_KEY = 'assembly';

export interface PipelineTask {
  artist: string;
  hip_file?: string;
  status?: string;
  notes?: string;
  published_at?: string;
}

export type TaskKind = 'block' | 'assembly';

function isPipelineTask(value: unknown): value is PipelineTask {
  return typeof value === 'object' && value !== null && 'artist' in value;
}

export function getBlockTasks(tasks: Record<string, unknown> | undefined): Record<string, PipelineTask> {
  if (!tasks) return {};

  const blocks = tasks[BLOCKS_KEY];
  if (!blocks || typeof blocks !== 'object' || blocks === null) return {};

  const result: Record<string, PipelineTask> = {};
  for (const [key, value] of Object.entries(blocks as Record<string, unknown>)) {
    if (isPipelineTask(value)) result[key] = value;
  }
  return result;
}

export function getAssemblyTask(tasks: Record<string, unknown> | undefined): PipelineTask | undefined {
  if (!tasks) return undefined;
  const assembly = tasks[ASSEMBLY_KEY];
  return isPipelineTask(assembly) ? assembly : undefined;
}

export function collectColumnKeys(entities: Array<{ tasks?: Record<string, unknown> }>): {
  blocks: string[];
  showAssembly: boolean;
} {
  const blockKeys = new Set<string>();
  let hasAssembly = false;

  for (const entity of entities) {
    Object.keys(getBlockTasks(entity.tasks)).forEach((key) => blockKeys.add(key));
    if (getAssemblyTask(entity.tasks)) hasAssembly = true;
  }

  return {
    blocks: Array.from(blockKeys).sort(),
    showAssembly: hasAssembly || entities.length > 0,
  };
}

export function getEntityTask(
  tasks: Record<string, unknown> | undefined,
  key: string,
  kind: TaskKind,
): PipelineTask | undefined {
  if (kind === 'assembly') return getAssemblyTask(tasks);
  return getBlockTasks(tasks)[key];
}

export function iterateEntityTasks(
  entity: { tasks?: Record<string, unknown> },
  callback: (step: string, task: PipelineTask, kind: TaskKind) => void,
): void {
  const tasks = entity.tasks;
  const blocks = getBlockTasks(tasks);
  const assembly = getAssemblyTask(tasks);

  for (const [step, task] of Object.entries(blocks)) {
    callback(step, task, 'block');
  }
  if (assembly) {
    callback(ASSEMBLY_KEY, assembly, 'assembly');
  }

  // Legacy flat tasks (pre-unified schema)
  if (Object.keys(blocks).length === 0 && !assembly && tasks) {
    for (const [key, value] of Object.entries(tasks)) {
      if (key === BLOCKS_KEY || key === ASSEMBLY_KEY) continue;
      if (isPipelineTask(value)) callback(key, value, 'block');
    }
  }
}
