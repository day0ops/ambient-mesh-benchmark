// bench/run-matrix.direct-path.test.js
// Regression test: the 'direct' path's nodeMode is the literal string 'n/a',
// which must never reach a filesystem path (results.js builds filenames
// straight from run.nodeMode, and '/' in 'n/a' makes writeFile target a
// nonexistent subdirectory). Uses the REAL results.js so a regression here
// reproduces the actual ENOENT crash, not just a mocked assertion.
import { test, expect, mock } from 'bun:test';
import { mkdtemp, readdir, readFile } from 'fs/promises';
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
mock.module('./lib/meshcli.js', () => ({
  deployUsecase: async () => {},
  patchDeploymentResources: async () => {},
}));
mock.module('./lib/fortio.js', () => ({
  ensureFortioPod: async () => {},
  ensureFortioPortForward: async () => {},
  stopFortioPortForward: () => {},
  runLoadTest: async () => ({ p50Ms: 1, p95Ms: 2, p99Ms: 3, throughputQps: 100, errorCount: 0 }),
}));
mock.module('./lib/grafana.js', () => ({
  ensureImageRenderer: async () => {},
  capturePanel: async () => true,
}));
// Deliberately NOT mocking './lib/results.js' - this test exercises the real
// recordRun() writing to a real temp directory.

test('runMatrix on the direct path records results without crashing on nodeMode "n/a"', async () => {
  const resultsDir = await mkdtemp(join(tmpdir(), 'bench-direct-path-'));
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
    grafanaSettleMs: 0,
  });

  const files = await readdir(resultsDir);
  expect(files.length).toBe(1);
  expect(files[0]).not.toContain('n/a');
  expect(files[0]).toContain('none');

  const content = JSON.parse(await readFile(join(resultsDir, files[0]), 'utf8'));
  expect(content.nodeMode).toBe('none');
});
