// bench/run-matrix.test.js
import { test, expect, mock } from 'bun:test';

test('runMatrix cordon/uncordons, deploys, runs fortio per concurrency level, captures panels, and records results', async () => {
  const calls = [];

  mock.module('./lib/exec.js', () => ({
    run: async (cmd, args) => {
      calls.push({ mod: 'exec', cmd, args });
      if (cmd === 'kubectl' && args[0] === 'get' && args.includes('-o') && args.includes('jsonpath={.items[*].metadata.name}')) {
        return { stdout: 'node-b node-c', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  mock.module('./lib/cluster.js', () => ({
    cordonNode: async name => calls.push({ mod: 'cordon', name }),
    uncordonNode: async name => calls.push({ mod: 'uncordon', name }),
    ensureLoadGenNode: async () => calls.push({ mod: 'ensureLoadGenNode' }),
    waitForDeploymentReady: async (ns, name) => calls.push({ mod: 'wait', ns, name }),
    resolveGatewayServiceName: async (ns, gatewayName) => {
      calls.push({ mod: 'resolveGatewaySvc', ns, gatewayName });
      return 'ambient-benchmark-istio';
    },
  }));
  mock.module('./lib/meshcli.js', () => ({
    deployUsecase: async name => calls.push({ mod: 'deploy', name }),
    patchDeploymentResources: async (ns, name) => calls.push({ mod: 'patch', ns, name }),
  }));
  mock.module('./lib/fortio.js', () => ({
    ensureFortioPod: async () => calls.push({ mod: 'ensureFortio' }),
    runLoadTest: async ({ connections, targetHost }) => {
      calls.push({ mod: 'load', connections, targetHost });
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
  await runMatrix({
    meshFieldKitDir: '/fake/mesh-field-kit',
    grafanaUrl: 'http://grafana.example.com',
    grafanaAuth: { username: 'admin', password: 'secret' },
    resultsDir: '/fake/results',
    tier: 'default',
    concurrencyLevels: [8, 16],
    dashboardPanels: [{ dashboardUid: 'abc', panelId: 1, label: 'control-plane' }],
    paths: ['ztunnel'],
  });

  const deployCalls = calls.filter(c => c.mod === 'deploy');
  expect(deployCalls).toEqual([
    { mod: 'deploy', name: 'ambient-benchmark-ztunnel' },
    { mod: 'deploy', name: 'ambient-benchmark-ztunnel' },
  ]); // once per node mode (single, multi)

  const loadCalls = calls.filter(c => c.mod === 'load');
  expect(loadCalls.map(c => c.connections)).toEqual([8, 16, 8, 16]); // 2 concurrency levels x 2 node modes
  // targetHost must come from resolveGatewayServiceName's result, not a hardcoded guess.
  expect(loadCalls.every(c => c.targetHost === 'ambient-benchmark-istio.ambient-mesh-benchmark.svc.cluster.local')).toBe(true);

  const resolveCalls = calls.filter(c => c.mod === 'resolveGatewaySvc');
  expect(resolveCalls).toEqual([
    { mod: 'resolveGatewaySvc', ns: 'ambient-mesh-benchmark', gatewayName: 'ambient-benchmark' },
    { mod: 'resolveGatewaySvc', ns: 'ambient-mesh-benchmark', gatewayName: 'ambient-benchmark' },
  ]); // once per node mode (not once per concurrency level)

  const recordCalls = calls.filter(c => c.mod === 'record');
  expect(recordCalls.length).toBe(4);

  const cordonCalls = calls.filter(c => c.mod === 'cordon');
  expect(cordonCalls.length).toBeGreaterThan(0); // single-node mode cordons at least one of the 2 non-loadgen nodes
});
