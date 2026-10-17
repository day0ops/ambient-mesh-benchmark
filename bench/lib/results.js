// bench/lib/results.js
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

export async function recordRun(run, resultsDir) {
  await mkdir(resultsDir, { recursive: true });
  const safeTimestamp = run.timestamp.replace(/[:.]/g, '-');
  const fileName = `${run.path}-${run.nodeMode}-${run.tier}-${run.concurrency}-${safeTimestamp}.json`;
  const filePath = join(resultsDir, fileName);
  await writeFile(filePath, JSON.stringify(run, null, 2));
  return filePath;
}
