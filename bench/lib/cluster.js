// bench/lib/cluster.js
import { run } from './exec.js';
import { LOAD_GEN_NODE_LABEL } from '../config.js';

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

async function loadGenNodeNames() {
  const { stdout } = await run('kubectl', [
    'get',
    'nodes',
    '-l',
    `${LOAD_GEN_NODE_LABEL.key}=${LOAD_GEN_NODE_LABEL.value}`,
    '-o',
    'jsonpath={.items[*].metadata.name}',
  ]);
  return stdout.trim().split(/\s+/).filter(Boolean);
}

// Labels and taints a single node as the dedicated load-generator node, so
// Fortio (which tolerates the taint) can land there while the SUT (which has
// no tolerations) never can. Idempotent - safe to call on every runMatrix()
// invocation; reuses the already-labeled node and reapplies the taint rather
// than picking a new one or erroring if it's already tainted.
export async function ensureLoadGenNode() {
  const existing = await loadGenNodeNames();
  let name = existing[0];
  if (!name) {
    const nodes = await listNodes();
    if (nodes.length === 0) {
      throw new Error('ensureLoadGenNode: no nodes found in cluster');
    }
    name = nodes[0].name;
    await labelNode(name, LOAD_GEN_NODE_LABEL.key, LOAD_GEN_NODE_LABEL.value);
  }
  await run('kubectl', [
    'taint',
    'node',
    name,
    `${LOAD_GEN_NODE_LABEL.key}=${LOAD_GEN_NODE_LABEL.value}:NoSchedule`,
    '--overwrite',
  ]);
  return name;
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
