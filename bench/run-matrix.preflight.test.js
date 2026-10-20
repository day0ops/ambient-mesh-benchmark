// bench/run-matrix.preflight.test.js
// Regression test: missing required config (meshFieldKitDir, grafanaUrl,
// grafanaAuth.username/password - each backed by a required env var when run
// via the CLI) must fail fast with a clear error naming what's missing,
// before any cluster/kubectl call is made.
import { test, expect, mock } from 'bun:test';

test('runMatrix throws naming the missing config before touching the cluster', async () => {
  const calls = [];

  mock.module('./lib/exec.js', () => ({
    run: async (cmd, args) => {
      calls.push({ mod: 'exec', cmd, args });
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  mock.module('./lib/cluster.js', () => ({
    cordonNode: async () => {},
    uncordonNode: async () => {},
    ensureLoadGenNode: async () => calls.push({ mod: 'ensureLoadGenNode' }),
    waitForDeploymentReady: async () => {},
    resolveGatewayServiceName: async () => 'ambient-benchmark-istio',
  }));
  mock.module('./lib/meshcli.js', () => ({
    deployUsecase: async () => calls.push({ mod: 'deploy' }),
    patchDeploymentResources: async () => {},
  }));
  mock.module('./lib/fortio.js', () => ({
    ensureFortioPod: async () => calls.push({ mod: 'ensureFortio' }),
    ensureFortioPortForward: async () => {},
    stopFortioPortForward: () => {},
    runLoadTest: async () => ({ p50Ms: 1, p95Ms: 2, p99Ms: 3, throughputQps: 100, errorCount: 0 }),
  }));
  mock.module('./lib/grafana.js', () => ({
    ensureImageRenderer: async () => calls.push({ mod: 'ensureRenderer' }),
    capturePanel: async () => true,
  }));
  mock.module('./lib/results.js', () => ({
    recordRun: async () => '/fake/path.json',
    resultExists: async () => false,
  }));

  const { runMatrix } = await import('./run-matrix.js');

  const baseOpts = {
    meshFieldKitDir: '/fake/mesh-field-kit',
    grafanaUrl: 'http://grafana.example.com',
    grafanaAuth: { username: 'admin', password: 'secret' },
    resultsDir: '/fake/results',
    tier: 'default',
    concurrencyLevels: [8],
    dashboardPanels: [],
    paths: ['direct'],
    grafanaSettleMs: 0,
  };

  await expect(runMatrix({ ...baseOpts, meshFieldKitDir: undefined })).rejects.toThrow(
    'MESH_FIELD_KIT_DIR'
  );
  await expect(runMatrix({ ...baseOpts, grafanaUrl: undefined })).rejects.toThrow('GRAFANA_URL');
  await expect(
    runMatrix({ ...baseOpts, grafanaAuth: { username: '', password: '' } })
  ).rejects.toThrow('GRAFANA_ADMIN_USERNAME, GRAFANA_ADMIN_PASSWORD');

  // None of these failures should have reached the cluster.
  expect(calls).toEqual([]);
});
