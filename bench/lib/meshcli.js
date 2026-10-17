import { run } from './exec.js';

export async function deployUsecase(usecaseName, meshFieldKitDir) {
  return run(
    'bun',
    ['run', 'src/cli.js', 'usecase', 'deploy', '-n', usecaseName, '--skip-tests', '-y'],
    { cwd: meshFieldKitDir }
  );
}

export async function patchDeploymentResources(namespace, deploymentName, { cpu, memory }) {
  return run('kubectl', [
    'set',
    'resources',
    `deployment/${deploymentName}`,
    '-n',
    namespace,
    `--requests=cpu=${cpu},memory=${memory}`,
    `--limits=cpu=${cpu},memory=${memory}`,
  ]);
}
