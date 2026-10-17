// bench/lib/results.test.js
import { test, expect } from 'bun:test';
import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

test('recordRun writes a JSON file named after the run parameters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bench-results-'));
  const { recordRun } = await import('./results.js');
  const filePath = await recordRun(
    {
      path: 'ztunnel',
      nodeMode: 'single',
      tier: 'default',
      concurrency: 128,
      fortioResult: { p50Ms: 95, p95Ms: 187, p99Ms: 214, throughputQps: 583.61, errorCount: 0 },
      screenshotPaths: ['/tmp/panel1.png'],
      timestamp: '2026-10-17T00:00:00.000Z',
    },
    dir
  );
  expect(filePath).toBe(join(dir, 'ztunnel-single-default-128-2026-10-17T00-00-00-000Z.json'));
  const content = JSON.parse(await readFile(filePath, 'utf8'));
  expect(content.fortioResult.throughputQps).toBe(583.61);
  expect(content.screenshotPaths).toEqual(['/tmp/panel1.png']);
});
