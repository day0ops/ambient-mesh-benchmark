// bench/run-matrix.resume.test.js
// Regression test: a late failure on the paid cluster must not force a full
// matrix re-run. Before running each (path, nodeMode, tier, concurrency)
// combination, runMatrix() checks whether its result file already exists and
// skips it (and, when every concurrency level for a nodeMode is already
// recorded, skips deploying that nodeMode entirely). Uses the REAL
// results.js writing to a real temp dir so the check exercises the actual
// file-existence logic, not a mocked assertion.
import { test, expect, mock } from 'bun:test';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

mock.module('./lib/exec.js', () => ({
  run: async (cmd, args) => {
    if (cmd === 'kubectl' && args[0] === 'get' && args.includes('jsonpath={.items[*].metadata.name}')) {
      return { stdout: 'node-a node-b', stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  },
}));
mock.module('./lib/cluster.js', () => ({
  cordonNode: async () => {},
  uncordonNode: async () => {},
  ensureLoadGenNode: async () => {},
  waitForDeploymentReady: async () => {},
  resolveGatewayServiceName: async () => 'ambient-benchmark-istio',
}));
mock.module('./lib/grafana.js', () => ({
  ensureImageRenderer: async () => {},
  capturePanel: async () => true,
}));
// Deliberately NOT mocking './lib/results.js' - this exercises the real
// recordRun()/resultExists() pair against a real temp directory.

test('runMatrix skips a combination whose result file already exists, without calling deployUsecase or runLoadTest', async () => {
  const resultsDir = await mkdtemp(join(tmpdir(), 'bench-resume-'));
  const deployCalls = [];
  const loadCalls = [];

  mock.module('./lib/meshcli.js', () => ({
    deployUsecase: async name => deployCalls.push(name),
    patchDeploymentResources: async () => {},
  }));
  mock.module('./lib/fortio.js', () => ({
    ensureFortioPod: async () => {},
    runLoadTest: async ({ connections }) => {
      loadCalls.push(connections);
      return { p50Ms: 1, p95Ms: 2, p99Ms: 3, throughputQps: 100, errorCount: 0 };
    },
  }));

  const { recordRun } = await import('./lib/results.js');
  const { runMatrix } = await import('./run-matrix.js');

  // Pre-populate a result for the only (path, nodeMode, tier, concurrency)
  // combination this run will attempt - the 'direct' path's single nodeMode
  // ('n/a' -> 'none') at concurrency 8.
  await recordRun(
    {
      path: 'direct',
      nodeMode: 'none',
      tier: 'default',
      concurrency: 8,
      fortioResult: { p50Ms: 1, p95Ms: 2, p99Ms: 3, throughputQps: 100, errorCount: 0 },
      screenshotPaths: [],
      timestamp: '2026-10-17T00:00:00.000Z',
    },
    resultsDir
  );

  await runMatrix({
    meshFieldKitDir: '/fake/mesh-field-kit',
    grafanaUrl: 'http://grafana.example.com',
    grafanaAuth: { username: 'admin', password: 'secret' },
    resultsDir,
    tier: 'default',
    concurrencyLevels: [8],
    dashboardPanels: [],
    paths: ['direct'],
  });

  expect(deployCalls).toEqual([]);
  expect(loadCalls).toEqual([]);
});

test('runMatrix runs a combination normally when no prior result file exists', async () => {
  const resultsDir = await mkdtemp(join(tmpdir(), 'bench-resume-'));
  const deployCalls = [];
  const loadCalls = [];

  mock.module('./lib/meshcli.js', () => ({
    deployUsecase: async name => deployCalls.push(name),
    patchDeploymentResources: async () => {},
  }));
  mock.module('./lib/fortio.js', () => ({
    ensureFortioPod: async () => {},
    runLoadTest: async ({ connections }) => {
      loadCalls.push(connections);
      return { p50Ms: 1, p95Ms: 2, p99Ms: 3, throughputQps: 100, errorCount: 0 };
    },
  }));

  const { runMatrix } = await import('./run-matrix.js');

  await runMatrix({
    meshFieldKitDir: '/fake/mesh-field-kit',
    grafanaUrl: 'http://grafana.example.com',
    grafanaAuth: { username: 'admin', password: 'secret' },
    resultsDir,
    tier: 'default',
    concurrencyLevels: [8],
    dashboardPanels: [],
    paths: ['direct'],
  });

  expect(deployCalls).toEqual(['ambient-benchmark-direct']);
  expect(loadCalls).toEqual([8]);
});
