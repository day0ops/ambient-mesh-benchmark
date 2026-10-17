// bench/lib/fortio.js
import { run } from './exec.js';

const NAMESPACE = 'ambient-mesh-benchmark';
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
  const percentile = p => raw.DurationHistogram.Percentiles.find(x => x.Percentile === p)?.Value;
  const errorCount = Object.entries(raw.RetCodes || {})
    .filter(([code]) => !code.startsWith('2'))
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    p50Ms: percentile(50) * 1000,
    p95Ms: percentile(95) * 1000,
    p99Ms: percentile(99) * 1000,
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
