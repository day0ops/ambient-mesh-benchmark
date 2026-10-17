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
