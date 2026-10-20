import { run } from './exec.js';

export async function deployUsecase(usecaseName, meshFieldKitDir) {
  return run(
    'bun',
    ['run', 'src/cli.js', 'usecase', 'deploy', '-n', usecaseName, '--skip-tests', '-y'],
    { cwd: meshFieldKitDir }
  );
}

// cpuLimit is deliberately omitted by default (undefined/null) - a hard CPU
// limit causes Kubernetes CFS quota throttling in short bursts even when
// average usage looks low, which showed up directly as benchmark tail
// latency. Memory keeps requests==limits since uncapped memory risks the
// node, not just the pod, and heap sizing already addresses GC pressure.
export async function patchDeploymentResources(namespace, deploymentName, { cpuRequest, cpuLimit, memory }) {
  const limitsParts = [`memory=${memory}`];
  if (cpuLimit) limitsParts.push(`cpu=${cpuLimit}`);
  return run('kubectl', [
    'set',
    'resources',
    `deployment/${deploymentName}`,
    '-n',
    namespace,
    `--requests=cpu=${cpuRequest},memory=${memory}`,
    `--limits=${limitsParts.join(',')}`,
  ]);
}
