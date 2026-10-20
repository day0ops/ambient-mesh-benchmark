// bench/run-matrix.tier-resources.test.js
// The benchmark measures Istio's own overhead, not app scaling - both tiers
// must patch deployment resources (not just 'scaled') so the apps are never
// the bottleneck, and each tier must apply its own distinct resource values.
import { test, expect, mock } from 'bun:test';
import { TIER_RESOURCES } from './config.js';

function mockHarness(calls) {
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
    patchDeploymentResources: async (ns, name, resources) => calls.push({ ns, name, resources }),
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
  mock.module('./lib/results.js', () => ({
    recordRun: async () => '/fake/path.json',
    resultExists: async () => false,
  }));
}

test('runMatrix patches the default tier to 1 CPU/1Gi (not left unpatched)', async () => {
  const calls = [];
  mockHarness(calls);
  const { runMatrix } = await import('./run-matrix.js');

  await runMatrix({
    meshFieldKitDir: '/fake/mesh-field-kit',
    grafanaUrl: 'http://grafana.example.com',
    grafanaAuth: { username: 'admin', password: 'secret' },
    resultsDir: '/fake/results',
    tier: 'default',
    concurrencyLevels: [8],
    dashboardPanels: [],
    paths: ['direct'],
    grafanaSettleMs: 0,
  });

  expect(calls).toEqual([
    { ns: 'ambient-mesh-benchmark', name: 'account-service', resources: TIER_RESOURCES.default },
    { ns: 'ambient-mesh-benchmark', name: 'ledger-service', resources: TIER_RESOURCES.default },
  ]);
  expect(TIER_RESOURCES.default).toEqual({ cpu: '1000m', memory: '1Gi' });
});

test('runMatrix patches the scaled tier to 2 CPU/2Gi', async () => {
  const calls = [];
  mockHarness(calls);
  const { runMatrix } = await import('./run-matrix.js');

  await runMatrix({
    meshFieldKitDir: '/fake/mesh-field-kit',
    grafanaUrl: 'http://grafana.example.com',
    grafanaAuth: { username: 'admin', password: 'secret' },
    resultsDir: '/fake/results',
    tier: 'scaled',
    concurrencyLevels: [8],
    dashboardPanels: [],
    paths: ['direct'],
    grafanaSettleMs: 0,
  });

  expect(calls).toEqual([
    { ns: 'ambient-mesh-benchmark', name: 'account-service', resources: TIER_RESOURCES.scaled },
    { ns: 'ambient-mesh-benchmark', name: 'ledger-service', resources: TIER_RESOURCES.scaled },
  ]);
  expect(TIER_RESOURCES.scaled).toEqual({ cpu: '2000m', memory: '2Gi' });
});

test('runMatrix throws a clear error for an unknown tier instead of silently skipping the patch', async () => {
  const calls = [];
  mockHarness(calls);
  const { runMatrix } = await import('./run-matrix.js');

  await expect(
    runMatrix({
      meshFieldKitDir: '/fake/mesh-field-kit',
      grafanaUrl: 'http://grafana.example.com',
      grafanaAuth: { username: 'admin', password: 'secret' },
      resultsDir: '/fake/results',
      tier: 'huge',
      concurrencyLevels: [8],
      dashboardPanels: [],
      paths: ['direct'],
      grafanaSettleMs: 0,
    })
  ).rejects.toThrow("runMatrix: unknown tier 'huge'");
  expect(calls).toEqual([]);
});
