export const SET_BLOCKS_KEY = 'blocks';
export const SET_REQUIRED_FLAT_COLUMNS = ['assembly'] as const;

export interface PipelineTask {
  artist: string;
  hip_file?: string;
  status?: 'wip' | 'ready' | 'final';
  notes?: string;
  published_at?: string;
}

function isPipelineTask(value: unknown): value is PipelineTask {
  return typeof value === 'object' && value !== null && 'artist' in value;
}

export function getSetFlatTasks(
  tasks: Record<string, unknown> | undefined,
): Record<string, PipelineTask> {
  if (!tasks) return {};

  const result: Record<string, PipelineTask> = {};
  for (const [key, value] of Object.entries(tasks)) {
    if (key === SET_BLOCKS_KEY) continue;
    if (isPipelineTask(value)) result[key] = value;
  }
  return result;
}

export function getSetBlockTasks(
  tasks: Record<string, unknown> | undefined,
): Record<string, PipelineTask> {
  if (!tasks) return {};

  const blocks = tasks[SET_BLOCKS_KEY];
  if (!blocks || typeof blocks !== 'object' || blocks === null) return {};

  const result: Record<string, PipelineTask> = {};
  for (const [key, value] of Object.entries(blocks as Record<string, unknown>)) {
    if (isPipelineTask(value)) result[key] = value;
  }
  return result;
}

export function collectSetColumnKeys(sets: Array<{ tasks?: Record<string, unknown> }>): {
  flat: string[];
  blocks: string[];
} {
  const flatKeys = new Set<string>(SET_REQUIRED_FLAT_COLUMNS);
  const blockKeys = new Set<string>();

  for (const set of sets) {
    Object.keys(getSetFlatTasks(set.tasks)).forEach((key) => flatKeys.add(key));
    Object.keys(getSetBlockTasks(set.tasks)).forEach((key) => blockKeys.add(key));
  }

  const otherFlatKeys = Array.from(flatKeys)
    .filter((key) => !(SET_REQUIRED_FLAT_COLUMNS as readonly string[]).includes(key))
    .sort();

  return {
    flat: [...otherFlatKeys, ...SET_REQUIRED_FLAT_COLUMNS],
    blocks: Array.from(blockKeys).sort(),
  };
}

export function getSetTask(
  tasks: Record<string, unknown> | undefined,
  key: string,
  kind: 'flat' | 'block',
): PipelineTask | undefined {
  if (kind === 'flat') return getSetFlatTasks(tasks)[key];
  return getSetBlockTasks(tasks)[key];
}

export function iterateSetTasks(
  set: { tasks?: Record<string, unknown> },
  callback: (step: string, task: PipelineTask, kind: 'flat' | 'block') => void,
): void {
  for (const [step, task] of Object.entries(getSetFlatTasks(set.tasks))) {
    callback(step, task, 'flat');
  }
  for (const [step, task] of Object.entries(getSetBlockTasks(set.tasks))) {
    callback(step, task, 'block');
  }
}
