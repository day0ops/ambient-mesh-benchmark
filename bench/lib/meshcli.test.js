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

test('patchDeploymentResources runs kubectl set resources with matching requests/limits', async () => {
  let captured = null;
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      captured = { cmd, args };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { patchDeploymentResources } = await import('./meshcli.js');
  await patchDeploymentResources('ambient-mesh-benchmark', 'account-service', {
    cpu: '2000m',
    memory: '2Gi',
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
      '--limits=cpu=2000m,memory=2Gi',
    ],
  });
});
