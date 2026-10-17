// bench/run-matrix.finally-safety.test.js
// Regression test: if the finally block's own final uncordon-all kubectl
// call fails (e.g. kubectl unavailable), that failure must be logged, not
// thrown - otherwise it replaces/masks the original error that triggered the
// finally block in the first place.
import { test, expect, mock } from 'bun:test';

test('runMatrix still propagates the original error when cleanup itself fails', async () => {
  let getNodesCalls = 0;

  mock.module('./lib/exec.js', () => ({
    run: async (cmd, args) => {
      if (cmd === 'kubectl' && args[0] === 'get' && args.includes('jsonpath={.items[*].metadata.name}')) {
        getNodesCalls += 1;
        // First call succeeds (applyNodeMode's lookup); the finally block's
        // cleanup lookup is the second call and simulates kubectl going away.
        if (getNodesCalls > 1) {
          throw new Error('kubectl: command not found');
        }
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
    deployUsecase: async () => {
      throw new Error('boom: deploy failed');
    },
    patchDeploymentResources: async () => {},
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

  await expect(
    runMatrix({
      meshFieldKitDir: '/fake/mesh-field-kit',
      grafanaUrl: 'http://grafana.example.com',
      grafanaAuth: { username: 'admin', password: 'secret' },
      resultsDir: '/fake/results',
      tier: 'default',
      concurrencyLevels: [8],
      dashboardPanels: [],
      paths: ['ztunnel'],
      grafanaSettleMs: 0,
    })
  ).rejects.toThrow('boom: deploy failed');

  expect(getNodesCalls).toBe(2);
});

test('runMatrix throws the cleanup error when the main path succeeds but the final uncordon fails', async () => {
  let uncordonCalls = 0;

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
    uncordonNode: async () => {
      uncordonCalls += 1;
      // The 'direct' path's applyNodeMode('multi') uncordons node-a and
      // node-b up front (calls 1-2); the finally block's cleanup pass is
      // what simulates a transient kubectl failure here.
      if (uncordonCalls > 2) {
        throw new Error('kubectl: uncordon transient failure');
      }
    },
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

  await expect(
    runMatrix({
      meshFieldKitDir: '/fake/mesh-field-kit',
      grafanaUrl: 'http://grafana.example.com',
      grafanaAuth: { username: 'admin', password: 'secret' },
      resultsDir: '/fake/results',
      tier: 'default',
      concurrencyLevels: [8],
      dashboardPanels: [],
      paths: ['direct'],
      grafanaSettleMs: 0,
    })
  ).rejects.toThrow('kubectl: uncordon transient failure');
});
