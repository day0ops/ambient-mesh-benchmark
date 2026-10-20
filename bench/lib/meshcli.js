import { run } from './exec.js';

export async function deployUsecase(usecaseName, meshFieldKitDir) {
  return run(
    'bun',
    ['run', 'src/cli.js', 'usecase', 'deploy', '-n', usecaseName, '--skip-tests', '-y'],
    { cwd: meshFieldKitDir }
  );
}

// cpuLimit/memoryLimit are deliberately omitted by default (undefined/null) -
// the apps are meant to scale unbounded so they're never the bottleneck;
// only Istio's own overhead is under test.
export async function patchDeploymentResources(namespace, deploymentName, { cpuRequest, cpuLimit, memoryRequest, memoryLimit }) {
  const limitsParts = [];
  if (cpuLimit) limitsParts.push(`cpu=${cpuLimit}`);
  if (memoryLimit) limitsParts.push(`memory=${memoryLimit}`);
  const args = [
    'set',
    'resources',
    `deployment/${deploymentName}`,
    '-n',
    namespace,
    `--requests=cpu=${cpuRequest},memory=${memoryRequest}`,
  ];
  if (limitsParts.length > 0) args.push(`--limits=${limitsParts.join(',')}`);
  return run('kubectl', args);
}
