// bench/lib/fortio.test.js
import { test, expect, mock } from 'bun:test';

const SAMPLE_FORTIO_JSON = JSON.stringify({
  ActualQPS: 583.61,
  ActualDuration: 30000000000,
  DurationHistogram: {
    Percentiles: [
      { Percentile: 50, Value: 0.095 },
      { Percentile: 95, Value: 0.187 },
      { Percentile: 99, Value: 0.214 },
    ],
  },
  RetCodes: { '200': 17500, '503': 3 },
});

test('ensureFortioPod applies the manifest and waits for the pod to be ready', async () => {
  const calls = [];
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { ensureFortioPod } = await import('./fortio.js');
  await ensureFortioPod();
  expect(calls[0]).toEqual({
    cmd: 'kubectl',
    args: ['apply', '-f', expect.stringContaining('fortio-pod.yaml')],
  });
  expect(calls[1]).toEqual({
    cmd: 'kubectl',
    args: [
      'wait',
      '--for=condition=Ready',
      'pod/fortio-loadgen',
      '-n',
      'ambient-mesh-benchmark',
      '--timeout=120s',
    ],
  });
});

test('runLoadTest execs fortio load with the right flags and parses the JSON result', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: SAMPLE_FORTIO_JSON, stderr: '', exitCode: 0 };
    },
  }));
  const { runLoadTest } = await import('./fortio.js');
  const result = await runLoadTest({
    connections: 128,
    durationSec: 30,
    targetHost: 'ambient-benchmark.ambient-mesh-benchmark.svc.cluster.local',
    hostHeader: 'ambient-benchmark.example.com',
    path: '/api/v1/transfers',
    method: 'POST',
    payload: '{"fromAccount":"acc-001","toAccount":"acc-002","amount":1.00,"currency":"USD"}',
  });
  expect(captured.cmd).toBe('kubectl');
  expect(captured.args).toEqual([
    'exec',
    'fortio-loadgen',
    '-n',
    'ambient-mesh-benchmark',
    '--',
    'fortio',
    'load',
    '-c',
    '128',
    '-qps',
    '0',
    '-t',
    '30s',
    '-json',
    '-',
    '-X',
    'POST',
    '-H',
    'Host: ambient-benchmark.example.com',
    '-H',
    'Content-Type: application/json',
    '-payload',
    '{"fromAccount":"acc-001","toAccount":"acc-002","amount":1.00,"currency":"USD"}',
    'http://ambient-benchmark.ambient-mesh-benchmark.svc.cluster.local/api/v1/transfers',
  ]);
  expect(result.p50Ms).toBeCloseTo(95, 0);
  expect(result.p95Ms).toBeCloseTo(187, 0);
  expect(result.p99Ms).toBeCloseTo(214, 0);
  expect(result.throughputQps).toBeCloseTo(583.61, 2);
  expect(result.errorCount).toBe(3);
});
