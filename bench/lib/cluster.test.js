// bench/lib/cluster.test.js
import { test, expect, mock } from 'bun:test';

test('listNodes parses kubectl get nodes json output', async () => {
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      expect(cmd).toBe('kubectl');
      expect(args).toEqual(['get', 'nodes', '-o', 'json']);
      return {
        stdout: JSON.stringify({
          items: [
            { metadata: { name: 'node-a' }, spec: {} },
            { metadata: { name: 'node-b' }, spec: { unschedulable: true } },
          ],
        }),
        stderr: '',
        exitCode: 0,
      };
    },
  }));
  const { listNodes } = await import('./cluster.js');
  const nodes = await listNodes();
  expect(nodes).toEqual([
    { name: 'node-a', schedulable: true },
    { name: 'node-b', schedulable: false },
  ]);
});

test('cordonNode calls kubectl cordon with the node name', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { cordonNode } = await import('./cluster.js');
  await cordonNode('node-a');
  expect(captured).toEqual({ cmd: 'kubectl', args: ['cordon', 'node-a'] });
});

test('uncordonNode calls kubectl uncordon with the node name', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { uncordonNode } = await import('./cluster.js');
  await uncordonNode('node-a');
  expect(captured).toEqual({ cmd: 'kubectl', args: ['uncordon', 'node-a'] });
});

test('labelNode calls kubectl label with --overwrite', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { labelNode } = await import('./cluster.js');
  await labelNode('node-a', 'benchmark-role', 'loadgen');
  expect(captured).toEqual({
    cmd: 'kubectl',
    args: ['label', 'node', 'node-a', 'benchmark-role=loadgen', '--overwrite'],
  });
});

test('resolveGatewayServiceName looks up the Service by gateway-name label and returns its name', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: 'ambient-benchmark-istio\n', stderr: '', exitCode: 0 };
    },
  }));
  const { resolveGatewayServiceName } = await import('./cluster.js');
  const name = await resolveGatewayServiceName('ambient-mesh-benchmark', 'ambient-benchmark');
  expect(captured).toEqual({
    cmd: 'kubectl',
    args: [
      'get',
      'svc',
      '-n',
      'ambient-mesh-benchmark',
      '-l',
      'gateway.networking.k8s.io/gateway-name=ambient-benchmark',
      '-o',
      'jsonpath={.items[0].metadata.name}',
    ],
  });
  expect(name).toBe('ambient-benchmark-istio');
});

test('resolveGatewayServiceName retries until the Service name appears', async () => {
  let calls = 0;
  mock.module('./exec.js', () => ({
    run: async () => {
      calls += 1;
      if (calls < 3) return { stdout: '', stderr: '', exitCode: 0 };
      return { stdout: 'ambient-benchmark-istio\n', stderr: '', exitCode: 0 };
    },
  }));
  const { resolveGatewayServiceName } = await import('./cluster.js');
  const name = await resolveGatewayServiceName('ambient-mesh-benchmark', 'ambient-benchmark', {
    intervalMs: 0,
    timeoutMs: 1000,
  });
  expect(name).toBe('ambient-benchmark-istio');
  expect(calls).toBe(3);
});

test('resolveGatewayServiceName throws a clear error after exhausting retries', async () => {
  mock.module('./exec.js', () => ({
    run: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
  }));
  const { resolveGatewayServiceName } = await import('./cluster.js');
  await expect(
    resolveGatewayServiceName('ambient-mesh-benchmark', 'ambient-benchmark', {
      intervalMs: 0,
      timeoutMs: 20,
    })
  ).rejects.toThrow(
    'Could not resolve gateway Service for gatewayName=ambient-benchmark in namespace=ambient-mesh-benchmark'
  );
});

test('ensureLoadGenNode labels and taints the first node when none is labeled yet', async () => {
  const calls = [];
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      calls.push({ cmd, args });
      if (args[0] === 'get' && args[1] === 'nodes' && args.includes('-l')) {
        if (args[3] === 'benchmark-role=loadgen') {
          return { stdout: '', stderr: '', exitCode: 0 }; // no node labeled yet
        }
      }
      if (args[0] === 'get' && args[1] === 'nodes' && args.includes('-o') && args.includes('json')) {
        return {
          stdout: JSON.stringify({
            items: [
              { metadata: { name: 'node-a' }, spec: {} },
              { metadata: { name: 'node-b' }, spec: {} },
            ],
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { ensureLoadGenNode } = await import('./cluster.js');
  const name = await ensureLoadGenNode();
  expect(name).toBe('node-a');

  const labelCall = calls.find(c => c.args[0] === 'label');
  expect(labelCall.args).toEqual(['label', 'node', 'node-a', 'benchmark-role=loadgen', '--overwrite']);

  const taintCall = calls.find(c => c.args[0] === 'taint');
  expect(taintCall.args).toEqual([
    'taint',
    'node',
    'node-a',
    'benchmark-role=loadgen:NoSchedule',
    '--overwrite',
  ]);
});

test('ensureLoadGenNode reuses an already-labeled node without re-labeling, and still reapplies the taint', async () => {
  const calls = [];
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      calls.push({ cmd, args });
      if (args[0] === 'get' && args[1] === 'nodes' && args.includes('-l')) {
        return { stdout: 'node-c\n', stderr: '', exitCode: 0 }; // already labeled
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { ensureLoadGenNode } = await import('./cluster.js');
  const name = await ensureLoadGenNode();
  expect(name).toBe('node-c');

  expect(calls.some(c => c.args[0] === 'label')).toBe(false);

  const taintCall = calls.find(c => c.args[0] === 'taint');
  expect(taintCall.args).toEqual([
    'taint',
    'node',
    'node-c',
    'benchmark-role=loadgen:NoSchedule',
    '--overwrite',
  ]);
  // listNodes (get nodes -o json) must never be called once a node is already labeled.
  expect(calls.some(c => c.args.includes('json'))).toBe(false);
});

test('waitForDeploymentReady calls kubectl rollout status with a timeout', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { waitForDeploymentReady } = await import('./cluster.js');
  await waitForDeploymentReady('ambient-mesh-benchmark', 'account-service', 120);
  expect(captured).toEqual({
    cmd: 'kubectl',
    args: [
      'rollout',
      'status',
      'deployment/account-service',
      '-n',
      'ambient-mesh-benchmark',
      '--timeout=120s',
    ],
  });
});
