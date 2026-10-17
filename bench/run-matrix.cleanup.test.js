// bench/run-matrix.cleanup.test.js
// Regression test: if any step in the matrix loop throws, all non-loadgen
// nodes must still get uncordoned (no manual recovery left to the operator),
// and the original error must still propagate to the caller.
import { test, expect, mock } from 'bun:test';

test('runMatrix uncordons all nodes and rethrows when a step fails partway through', async () => {
  const calls = [];
  let deployCallCount = 0;

  mock.module('./lib/exec.js', () => ({
    run: async (cmd, args) => {
      calls.push({ mod: 'exec', cmd, args });
      if (cmd === 'kubectl' && args[0] === 'get' && args.includes('jsonpath={.items[*].metadata.name}')) {
        return { stdout: 'node-a node-b', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  mock.module('./lib/cluster.js', () => ({
    cordonNode: async name => calls.push({ mod: 'cordon', name }),
    uncordonNode: async name => calls.push({ mod: 'uncordon', name }),
    waitForDeploymentReady: async (ns, name) => calls.push({ mod: 'wait', ns, name }),
    resolveGatewayServiceName: async () => 'ambient-benchmark-istio',
  }));
  mock.module('./lib/meshcli.js', () => ({
    deployUsecase: async name => {
      deployCallCount += 1;
      calls.push({ mod: 'deploy', name });
      // Throw on the FIRST call, i.e. during the 'single' nodeMode
      // iteration, before the 'multi' iteration's applyNodeMode() has a
      // chance to uncordon everything on its own. This keeps the assertion
      // honest: any uncordon calls observed below must come from the
      // try/finally cleanup, not incidentally from node-mode switching.
      if (deployCallCount === 1) throw new Error('boom: deploy failed');
    },
    patchDeploymentResources: async (ns, name) => calls.push({ mod: 'patch', ns, name }),
  }));
  mock.module('./lib/fortio.js', () => ({
    ensureFortioPod: async () => calls.push({ mod: 'ensureFortio' }),
    runLoadTest: async ({ connections }) => {
      calls.push({ mod: 'load', connections });
      return { p50Ms: 100, p95Ms: 200, p99Ms: 250, throughputQps: 500, errorCount: 0 };
    },
  }));
  mock.module('./lib/grafana.js', () => ({
    ensureImageRenderer: async () => calls.push({ mod: 'ensureRenderer' }),
    capturePanel: async ({ panelId }) => {
      calls.push({ mod: 'capture', panelId });
      return true;
    },
  }));
  mock.module('./lib/results.js', () => ({
    recordRun: async run => {
      calls.push({ mod: 'record', path: run.path, concurrency: run.concurrency });
      return '/fake/path.json';
    },
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
      paths: ['ztunnel'], // two node modes: single, multi -> first deployUsecase call throws
    })
  ).rejects.toThrow('boom: deploy failed');

  const uncordonCalls = calls.filter(c => c.mod === 'uncordon');
  expect(uncordonCalls.map(c => c.name).sort()).toEqual(['node-a', 'node-b']);
});
