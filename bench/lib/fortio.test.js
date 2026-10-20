// bench/lib/fortio.test.js
import { test, expect, mock, afterEach } from 'bun:test';

const SAMPLE_FORTIO_JSON = {
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
};

let originalFetch;

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
  originalFetch = undefined;
});

// runLoadTest() calls ensureFortioPortForward() internally before each REST
// call, which (with default options) also goes through globalThis.fetch to
// health-check the port-forward. Routing by URL keeps that health check
// always "healthy" so it never falls through to spawning a real kubectl
// process in these unit tests, while still letting each test control the
// actual /fortio/rest/run response.
function mockFetch(handleRestRun) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/fortio/') {
      return { ok: true };
    }
    return handleRestRun(parsed);
  };
}

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
      'benchmark-loadgen',
      '--timeout=120s',
    ],
  });
});

test('ensureFortioPortForward returns immediately when already healthy, without spawning', async () => {
  const { ensureFortioPortForward } = await import('./fortio.js');
  let spawnCalled = false;

  const localPort = await ensureFortioPortForward({
    localPort: 8080,
    checkReady: async () => true,
    spawn: () => {
      spawnCalled = true;
      return { kill: () => {} };
    },
  });

  expect(localPort).toBe(8080);
  expect(spawnCalled).toBe(false);
});

test('ensureFortioPortForward spawns kubectl port-forward and polls until ready', async () => {
  const { ensureFortioPortForward } = await import('./fortio.js');
  let readyChecks = 0;
  let spawnArgs = null;

  const localPort = await ensureFortioPortForward({
    localPort: 9090,
    pollIntervalMs: 0,
    checkReady: async () => {
      readyChecks += 1;
      return readyChecks >= 3;
    },
    spawn: cmd => {
      spawnArgs = cmd;
      return { kill: () => {} };
    },
  });

  expect(localPort).toBe(9090);
  expect(spawnArgs).toEqual([
    'kubectl',
    'port-forward',
    'pod/fortio-loadgen',
    '-n',
    'benchmark-loadgen',
    '9090:8080',
  ]);
  expect(readyChecks).toBeGreaterThanOrEqual(3);
});

test('ensureFortioPortForward throws a clear error if the port-forward never becomes ready', async () => {
  const { ensureFortioPortForward } = await import('./fortio.js');

  await expect(
    ensureFortioPortForward({
      localPort: 8080,
      timeoutMs: 10,
      pollIntervalMs: 5,
      checkReady: async () => false,
      spawn: () => ({ kill: () => {} }),
    })
  ).rejects.toThrow('ensureFortioPortForward: port-forward to fortio-loadgen did not become ready');
});

test('stopFortioPortForward kills the tracked process', async () => {
  const { ensureFortioPortForward, stopFortioPortForward } = await import('./fortio.js');
  let killed = false;

  // checkReady never passes, forcing ensureFortioPortForward to spawn (and
  // eventually time out) so there's a tracked process to kill.
  await ensureFortioPortForward({
    localPort: 8080,
    checkReady: async () => false,
    pollIntervalMs: 0,
    timeoutMs: 5,
    spawn: () => ({
      kill: () => {
        killed = true;
      },
    }),
  }).catch(() => {});

  stopFortioPortForward();
  expect(killed).toBe(true);
});

test('runLoadTest calls the fortio REST API with the right query params and parses the result', async () => {
  let capturedUrl = null;
  mockFetch(parsed => {
    capturedUrl = parsed;
    return { ok: true, json: async () => SAMPLE_FORTIO_JSON };
  });

  const { runLoadTest } = await import('./fortio.js');
  const result = await runLoadTest({
    connections: 128,
    durationSec: 30,
    targetHost: 'ambient-benchmark.ambient-mesh-benchmark.svc.cluster.local',
    hostHeader: 'ambient-benchmark.example.com',
    path: '/api/v1/transfers',
    method: 'POST',
    payload: '{"fromAccount":"acc-001","toAccount":"acc-002","amount":1.00,"currency":"USD"}',
    localPort: 8080,
  });

  expect(capturedUrl.origin + capturedUrl.pathname).toBe('http://localhost:8080/fortio/rest/run');
  expect(capturedUrl.searchParams.get('url')).toBe(
    'http://ambient-benchmark.ambient-mesh-benchmark.svc.cluster.local/api/v1/transfers'
  );
  // -1 is the REST API's own sentinel for max/unlimited throughput - confirmed
  // against a real fortio server; qps=0 (the CLI's meaning) silently becomes
  // a fixed low default QPS via REST instead.
  expect(capturedUrl.searchParams.get('qps')).toBe('-1');
  expect(capturedUrl.searchParams.get('t')).toBe('30s');
  expect(capturedUrl.searchParams.get('c')).toBe('128');
  expect(capturedUrl.searchParams.get('p')).toBe('50,95,99');
  expect(capturedUrl.searchParams.get('x')).toBe('POST');
  expect(capturedUrl.searchParams.getAll('H')).toEqual([
    'Host: ambient-benchmark.example.com',
    'Content-Type: application/json',
  ]);
  expect(capturedUrl.searchParams.get('payload')).toBe(
    '{"fromAccount":"acc-001","toAccount":"acc-002","amount":1.00,"currency":"USD"}'
  );

  expect(result.p50Ms).toBeCloseTo(95, 0);
  expect(result.p95Ms).toBeCloseTo(187, 0);
  expect(result.p99Ms).toBeCloseTo(214, 0);
  expect(result.throughputQps).toBeCloseTo(583.61, 2);
  expect(result.errorCount).toBe(3);
});

test('runLoadTest retries a transient fetch failure and succeeds on a later attempt', async () => {
  let attempts = 0;
  mockFetch(() => {
    attempts += 1;
    if (attempts < 3) throw new Error('fetch failed: connection refused');
    return { ok: true, json: async () => SAMPLE_FORTIO_JSON };
  });

  const { runLoadTest } = await import('./fortio.js');
  const result = await runLoadTest({
    connections: 1,
    durationSec: 1,
    targetHost: 'host',
    hostHeader: 'host',
    path: '/',
    method: 'GET',
    payload: '',
    localPort: 8080,
    maxRetries: 3,
  });

  expect(attempts).toBe(3);
  expect(result.throughputQps).toBeCloseTo(583.61, 2);
});

test('runLoadTest throws after exhausting retries on a persistent failure', async () => {
  mockFetch(() => {
    throw new Error('connection refused');
  });

  const { runLoadTest } = await import('./fortio.js');
  await expect(
    runLoadTest({
      connections: 1,
      durationSec: 1,
      targetHost: 'host',
      hostHeader: 'host',
      path: '/',
      method: 'GET',
      payload: '',
      localPort: 8080,
      maxRetries: 2,
    })
  ).rejects.toThrow('runLoadTest: fortio load failed after 3 attempt(s): connection refused');
});

test('runLoadTest does not retry a malformed fortio result - that is a deterministic bug, not a transient failure', async () => {
  let attempts = 0;
  mockFetch(() => {
    attempts += 1;
    return { ok: true, json: async () => ({ ActualQPS: 100, RetCodes: { '200': 10 } }) };
  });

  const { runLoadTest } = await import('./fortio.js');
  await expect(
    runLoadTest({
      connections: 1,
      durationSec: 1,
      targetHost: 'host',
      hostHeader: 'host',
      path: '/',
      method: 'GET',
      payload: '',
      localPort: 8080,
      maxRetries: 2,
    })
  ).rejects.toThrow('normalizeFortioResult: fortio result is missing DurationHistogram.Percentiles');
  expect(attempts).toBe(1);
});

test('runLoadTest records null for a percentile missing from the histogram instead of NaN', async () => {
  mockFetch(() => ({
    ok: true,
    json: async () => ({
      ActualQPS: 100,
      DurationHistogram: {
        Percentiles: [
          { Percentile: 50, Value: 0.1 },
          // 95th and 99th percentiles absent - too few samples.
        ],
      },
      RetCodes: { '200': 10 },
    }),
  }));

  const { runLoadTest } = await import('./fortio.js');
  const result = await runLoadTest({
    connections: 1,
    durationSec: 1,
    targetHost: 'host',
    hostHeader: 'host',
    path: '/',
    method: 'GET',
    payload: '',
    localPort: 8080,
  });
  expect(result.p50Ms).toBeCloseTo(100, 0);
  expect(result.p95Ms).toBeNull();
  expect(result.p99Ms).toBeNull();
});

test('runLoadTest throws a clear error on a non-ok REST response', async () => {
  mockFetch(() => ({
    ok: false,
    status: 400,
    text: async () => 'bad request: invalid qps',
  }));

  const { runLoadTest } = await import('./fortio.js');
  await expect(
    runLoadTest({
      connections: 1,
      durationSec: 1,
      targetHost: 'host',
      hostHeader: 'host',
      path: '/',
      method: 'GET',
      payload: '',
      localPort: 8080,
      maxRetries: 0,
    })
  ).rejects.toThrow('fortio REST run failed (400): bad request: invalid qps');
});
