// bench/run-matrix.payload-alternation.test.js
import { test, expect, mock } from 'bun:test';
import { TRANSFER_PAYLOADS } from './config.js';

test('runMatrix alternates transfer direction across consecutive load test runs', async () => {
  const payloads = [];

  mock.module('./lib/exec.js', () => ({
    run: async (cmd, args) => {
      if (cmd === 'kubectl' && args[0] === 'get' && args.includes('jsonpath={.items[*].metadata.name}')) {
        return { stdout: 'node-a', stderr: '', exitCode: 0 };
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
    runLoadTest: async ({ payload }) => {
      payloads.push(payload);
      return { p50Ms: 1, p95Ms: 2, p99Ms: 3, throughputQps: 100, errorCount: 0 };
    },
  }));
  mock.module('./lib/grafana.js', () => ({
    ensureImageRenderer: async () => {},
    capturePanel: async () => true,
  }));
  mock.module('./lib/results.js', () => ({
    recordRun: async () => '/fake/path.json',
    resultExists: async () => false,
  }));

  const { runMatrix } = await import('./run-matrix.js');
  await runMatrix({
    meshFieldKitDir: '/fake/mesh-field-kit',
    grafanaUrl: 'http://grafana.example.com',
    grafanaAuth: { username: 'admin', password: 'secret' },
    resultsDir: '/fake/results',
    tier: 'default',
    concurrencyLevels: [8, 16, 32, 64],
    dashboardPanels: [],
    paths: ['direct'],
    grafanaSettleMs: 0,
  });

  expect(payloads).toEqual([
    TRANSFER_PAYLOADS[0],
    TRANSFER_PAYLOADS[1],
    TRANSFER_PAYLOADS[0],
    TRANSFER_PAYLOADS[1],
  ]);
});
