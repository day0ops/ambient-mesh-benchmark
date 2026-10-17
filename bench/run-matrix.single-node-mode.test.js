// bench/run-matrix.single-node-mode.test.js
// Regression test: applyNodeMode('single') must be self-contained. It only
// cordoned names.slice(1), silently relying on names[0] already being
// schedulable from some prior step. If a previous run left names[0]
// cordoned (e.g. a crash mid-matrix), 'single' mode would leave the cluster
// with zero schedulable non-loadgen nodes instead of exactly one.
import { test, expect, mock } from 'bun:test';

test("applyNodeMode('single') uncordons the first node before cordoning the rest, regardless of prior state", async () => {
  const calls = [];

  mock.module('./lib/exec.js', () => ({
    run: async (cmd, args) => {
      if (cmd === 'kubectl' && args[0] === 'get' && args.includes('jsonpath={.items[*].metadata.name}')) {
        return { stdout: 'node-x node-y', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  mock.module('./lib/cluster.js', () => ({
    cordonNode: async name => calls.push({ mod: 'cordon', name }),
    uncordonNode: async name => calls.push({ mod: 'uncordon', name }),
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

  await runMatrix({
    meshFieldKitDir: '/fake/mesh-field-kit',
    grafanaUrl: 'http://grafana.example.com',
    grafanaAuth: { username: 'admin', password: 'secret' },
    resultsDir: '/fake/results',
    tier: 'default',
    concurrencyLevels: [8],
    dashboardPanels: [],
    paths: ['waypoint'], // first nodeMode is 'single'
  });

  const cordonOrUncordonCalls = calls.filter(c => c.mod === 'cordon' || c.mod === 'uncordon');
  // The very first cordon/uncordon call of the whole run happens inside the
  // 'single' nodeMode's applyNodeMode() - it must uncordon node-x (names[0])
  // before cordoning node-y (names.slice(1)), not assume node-x already is.
  expect(cordonOrUncordonCalls[0]).toEqual({ mod: 'uncordon', name: 'node-x' });
  expect(cordonOrUncordonCalls[1]).toEqual({ mod: 'cordon', name: 'node-y' });
});
