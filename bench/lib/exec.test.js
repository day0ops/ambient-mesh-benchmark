import { test, expect, mock } from 'bun:test';

test('run resolves with stdout/stderr/exitCode on success', async () => {
  const { run } = await import('./exec.js');
  const result = await run('echo', ['hello']);
  expect(result.stdout.trim()).toBe('hello');
  expect(result.exitCode).toBe(0);
});

test('run throws on nonzero exit by default', async () => {
  const { run } = await import('./exec.js');
  await expect(run('sh', ['-c', 'exit 3'])).rejects.toThrow();
});

test('run does not throw on nonzero exit when ignoreError is true', async () => {
  const { run } = await import('./exec.js');
  const result = await run('sh', ['-c', 'exit 3'], { ignoreError: true });
  expect(result.exitCode).toBe(3);
});
