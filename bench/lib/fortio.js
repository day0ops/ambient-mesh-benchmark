// bench/lib/fortio.js
import { run } from './exec.js';

// Deliberately decoupled from the system-under-test's namespace, and never
// labeled for any mesh dataplane mode, so Fortio's own egress is identical
// and unmeshed across all test paths, and survives usecase namespace churn.
const NAMESPACE = 'benchmark-loadgen';
const POD_NAME = 'fortio-loadgen';
const CONTROL_PORT = 8080;
const MANIFEST_PATH = new URL('../manifests/fortio-pod.yaml', import.meta.url).pathname;

export async function ensureFortioPod() {
  await run('kubectl', ['apply', '-f', MANIFEST_PATH]);
  await run('kubectl', [
    'wait',
    '--for=condition=Ready',
    `pod/${POD_NAME}`,
    '-n',
    NAMESPACE,
    '--timeout=120s',
  ]);
}

let portForwardProcess = null;

export function stopFortioPortForward() {
  if (portForwardProcess) {
    portForwardProcess.kill();
    portForwardProcess = null;
  }
}

// A kubectl exec session held open for a full load test's duration can be
// reset by an intermediate network hop well after fortio itself finished
// successfully on the pod - confirmed directly against a live cluster (the
// server-side run completed with zero errors; only the exec stream capturing
// its output failed). A stable port-forward to Fortio's own REST API
// (/fortio/rest/run) avoids the long-lived interactive exec stream entirely,
// while still running the actual load generation in-cluster - no external
// network noise, no dependency on the VPN-gated public NLB.
export async function ensureFortioPortForward({
  localPort = CONTROL_PORT,
  timeoutMs = 15000,
  pollIntervalMs = 300,
  checkReady = port => isPortForwardHealthy(port),
  spawn = defaultSpawn,
} = {}) {
  if (await checkReady(localPort)) return localPort;

  stopFortioPortForward();
  portForwardProcess = spawn([
    'kubectl',
    'port-forward',
    `pod/${POD_NAME}`,
    '-n',
    NAMESPACE,
    `${localPort}:${CONTROL_PORT}`,
  ]);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkReady(localPort)) return localPort;
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(
    `ensureFortioPortForward: port-forward to ${POD_NAME} did not become ready within ${timeoutMs}ms`
  );
}

function defaultSpawn(cmd) {
  return Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
}

async function isPortForwardHealthy(localPort) {
  try {
    const response = await fetch(`http://localhost:${localPort}/fortio/`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function normalizeFortioResult(raw) {
  if (!Array.isArray(raw.DurationHistogram?.Percentiles)) {
    throw new Error('normalizeFortioResult: fortio result is missing DurationHistogram.Percentiles');
  }
  // A percentile can be absent from the histogram with very few samples -
  // record null rather than NaN (undefined * 1000) for a missing one.
  const percentileMs = p => {
    const value = raw.DurationHistogram.Percentiles.find(x => x.Percentile === p)?.Value;
    return value === undefined ? null : value * 1000;
  };
  const errorCount = Object.entries(raw.RetCodes || {})
    .filter(([code]) => !code.startsWith('2'))
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    p50Ms: percentileMs(50),
    p95Ms: percentileMs(95),
    p99Ms: percentileMs(99),
    throughputQps: raw.ActualQPS,
    errorCount,
    raw,
  };
}

const DEFAULT_LOAD_TEST_RETRIES = 2;

async function fetchFortioResult(params, localPort) {
  const response = await fetch(`http://localhost:${localPort}/fortio/rest/run?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`fortio REST run failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

export async function runLoadTest({
  connections,
  durationSec,
  targetHost,
  hostHeader,
  path,
  method,
  payload,
  localPort = CONTROL_PORT,
  maxRetries = DEFAULT_LOAD_TEST_RETRIES,
}) {
  const params = new URLSearchParams();
  params.append('url', `http://${targetHost}${path}`);
  // -1 is the REST API's sentinel for max/unlimited throughput - qps=0 (the
  // CLI's own meaning of "no limit") silently gets coerced to a fixed low
  // default QPS via REST instead, confirmed directly against a live server.
  params.append('qps', '-1');
  params.append('t', `${durationSec}s`);
  params.append('c', String(connections));
  params.append('p', '50,95,99');
  params.append('payload', payload);
  params.append('H', `Host: ${hostHeader}`);
  params.append('H', 'Content-Type: application/json');
  params.append('x', method);

  // Retries cover transient port-forward/network failures only - a
  // malformed result (normalizeFortioResult) is a deterministic bug that
  // retrying can't fix, so that check happens after the loop, once.
  let lastError;
  let raw;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await ensureFortioPortForward({ localPort });
      raw = await fetchFortioResult(params, localPort);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw new Error(
      `runLoadTest: fortio load failed after ${maxRetries + 1} attempt(s): ${lastError.message}`
    );
  }
  return normalizeFortioResult(raw);
}
