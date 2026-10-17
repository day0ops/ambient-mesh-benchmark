// bench/lib/cluster.js
import { run } from './exec.js';

export async function listNodes() {
  const { stdout } = await run('kubectl', ['get', 'nodes', '-o', 'json']);
  const data = JSON.parse(stdout);
  return data.items.map(item => ({
    name: item.metadata.name,
    schedulable: !item.spec.unschedulable,
  }));
}

export async function cordonNode(name) {
  await run('kubectl', ['cordon', name]);
}

export async function uncordonNode(name) {
  await run('kubectl', ['uncordon', name]);
}

export async function labelNode(name, key, value) {
  await run('kubectl', ['label', 'node', name, `${key}=${value}`, '--overwrite']);
}

const RESOLVE_GATEWAY_SERVICE_INTERVAL_MS = 2000;
const RESOLVE_GATEWAY_SERVICE_TIMEOUT_MS = 30000;

// Gateway API controllers are not guaranteed to name the auto-provisioned
// Service after the Gateway resource - look it up by the label they do set.
// The Service can take a moment to appear after the Gateway is created, so
// poll briefly rather than failing (or returning an empty name) on the first try.
export async function resolveGatewayServiceName(
  namespace,
  gatewayName,
  {
    intervalMs = RESOLVE_GATEWAY_SERVICE_INTERVAL_MS,
    timeoutMs = RESOLVE_GATEWAY_SERVICE_TIMEOUT_MS,
  } = {}
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { stdout } = await run('kubectl', [
      'get',
      'svc',
      '-n',
      namespace,
      '-l',
      `gateway.networking.k8s.io/gateway-name=${gatewayName}`,
      '-o',
      'jsonpath={.items[0].metadata.name}',
    ]);
    const name = stdout.trim();
    if (name) return name;
    if (Date.now() >= deadline) {
      throw new Error(
        `Could not resolve gateway Service for gatewayName=${gatewayName} in namespace=${namespace} after ${timeoutMs / 1000}s`
      );
    }
    await Bun.sleep(intervalMs);
  }
}

export async function waitForDeploymentReady(namespace, name, timeoutSec) {
  await run('kubectl', [
    'rollout',
    'status',
    `deployment/${name}`,
    '-n',
    namespace,
    `--timeout=${timeoutSec}s`,
  ]);
}
