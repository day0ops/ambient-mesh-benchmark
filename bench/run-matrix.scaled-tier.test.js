// bench/run-matrix.scaled-tier.test.js
// Regression test: after patching deployment resources for the scaled tier,
// the harness must wait for both deployments to roll out before load-testing,
// otherwise the load test can hit a mix of old and new pods.
import { test, expect, mock } from 'bun:test';

test('runMatrix waits for both deployments to be ready again after scaled-tier resource patching', async () => {
  const calls = [];

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
    waitForDeploymentReady: async (ns, name) => calls.push({ mod: 'wait', ns, name }),
    resolveGatewayServiceName: async () => 'ambient-benchmark-istio',
  }));
  mock.module('./lib/meshcli.js', () => ({
    deployUsecase: async name => calls.push({ mod: 'deploy', name }),
    patchDeploymentResources: async (ns, name) => calls.push({ mod: 'patch', ns, name }),
  }));
  mock.module('./lib/fortio.js', () => ({
    ensureFortioPod: async () => {},
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
  });

  const waitCalls = calls.filter(c => c.mod === 'wait');
  // One wait pair right after deployUsecase, one more pair after the
  // scaled-tier resource patch, both for account-service and ledger-service.
  expect(waitCalls.map(c => c.name)).toEqual([
    'account-service',
    'ledger-service',
    'account-service',
    'ledger-service',
  ]);

  const patchIndex = calls.findIndex(c => c.mod === 'patch');
  const lastPatchIndex = calls.map(c => c.mod).lastIndexOf('patch');
  const waitsAfterPatch = calls.slice(lastPatchIndex + 1).filter(c => c.mod === 'wait');
  expect(waitsAfterPatch.map(c => c.name)).toEqual(['account-service', 'ledger-service']);
  expect(patchIndex).toBeGreaterThanOrEqual(0);
});
