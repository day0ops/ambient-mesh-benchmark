import { test, expect, mock } from 'bun:test';

test('deployUsecase runs the mesh CLI with --skip-tests from the given directory', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args, opts) => {
      captured = { cmd, args, opts };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { deployUsecase } = await import('./meshcli.js');
  await deployUsecase('ambient-benchmark-direct', '/path/to/mesh-field-kit');
  expect(captured.cmd).toBe('bun');
  expect(captured.args).toEqual([
    'run',
    'src/cli.js',
    'usecase',
    'deploy',
    '-n',
    'ambient-benchmark-direct',
    '--skip-tests',
    '-y',
  ]);
  expect(captured.opts.cwd).toBe('/path/to/mesh-field-kit');
});

test('patchDeploymentResources omits --limits entirely when cpu and memory limits are both unset', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { patchDeploymentResources } = await import('./meshcli.js');
  await patchDeploymentResources('ambient-mesh-benchmark', 'account-service', {
    cpuRequest: '2000m',
    cpuLimit: null,
    memoryRequest: '2Gi',
    memoryLimit: null,
  });
  expect(captured).toEqual({
    cmd: 'kubectl',
    args: [
      'set',
      'resources',
      'deployment/account-service',
      '-n',
      'ambient-mesh-benchmark',
      '--requests=cpu=2000m,memory=2Gi',
    ],
  });
});

test('patchDeploymentResources includes explicit cpu and memory limits when given', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { patchDeploymentResources } = await import('./meshcli.js');
  await patchDeploymentResources('ambient-mesh-benchmark', 'account-service', {
    cpuRequest: '1000m',
    cpuLimit: '4000m',
    memoryRequest: '1Gi',
    memoryLimit: '2Gi',
  });
  expect(captured).toEqual({
    cmd: 'kubectl',
    args: [
      'set',
      'resources',
      'deployment/account-service',
      '-n',
      'ambient-mesh-benchmark',
      '--requests=cpu=1000m,memory=1Gi',
      '--limits=cpu=4000m,memory=2Gi',
    ],
  });
});
