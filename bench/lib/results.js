// bench/lib/results.js
import { mkdir, readdir, writeFile } from 'fs/promises';
import { join } from 'path';

export async function recordRun(run, resultsDir) {
  await mkdir(resultsDir, { recursive: true });
  const safeTimestamp = run.timestamp.replace(/[:.]/g, '-');
  const fileName = `${run.path}-${run.nodeMode}-${run.tier}-${run.concurrency}-${safeTimestamp}.json`;
  const filePath = join(resultsDir, fileName);
  await writeFile(filePath, JSON.stringify(run, null, 2));
  return filePath;
}

// Checks for a prior recordRun() output for this exact combination, so a
// re-invocation after a crash can skip work already done instead of
// re-running the whole matrix on the paid cluster.
export async function resultExists(resultsDir, path, nodeMode, tier, concurrency) {
  const prefix = `${path}-${nodeMode}-${tier}-${concurrency}-`;
  let files;
  try {
    files = await readdir(resultsDir);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  return files.some(f => f.startsWith(prefix) && f.endsWith('.json'));
}
