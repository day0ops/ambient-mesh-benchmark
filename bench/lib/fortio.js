// bench/lib/fortio.js
import { run } from './exec.js';

// Deliberately decoupled from the system-under-test's namespace, and never
// labeled for any mesh dataplane mode, so Fortio's own egress is identical
// and unmeshed across all test paths, and survives usecase namespace churn.
const NAMESPACE = 'benchmark-loadgen';
const POD_NAME = 'fortio-loadgen';
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

export async function runLoadTest({
  connections,
  durationSec,
  targetHost,
  hostHeader,
  path,
  method,
  payload,
}) {
  const { stdout } = await run('kubectl', [
    'exec',
    POD_NAME,
    '-n',
    NAMESPACE,
    '--',
    'fortio',
    'load',
    '-c',
    String(connections),
    '-qps',
    '0',
    '-t',
    `${durationSec}s`,
    '-json',
    '-',
    '-X',
    method,
    '-H',
    `Host: ${hostHeader}`,
    '-H',
    'Content-Type: application/json',
    '-payload',
    payload,
    `http://${targetHost}${path}`,
  ]);
  return normalizeFortioResult(JSON.parse(stdout));
}
