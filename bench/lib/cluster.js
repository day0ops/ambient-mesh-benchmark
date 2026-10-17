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
