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

// Gateway API controllers are not guaranteed to name the auto-provisioned
// Service after the Gateway resource - look it up by the label they do set.
export async function resolveGatewayServiceName(namespace, gatewayName) {
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
  return stdout.trim();
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
