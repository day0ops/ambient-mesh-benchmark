export async function run(cmd, args = [], opts = {}) {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: opts.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0 && !opts.ignoreError) {
    throw new Error(
      `Command failed (${exitCode}): ${cmd} ${args.join(' ')}\n${stderr}`
    );
  }
  return { stdout, stderr, exitCode };
}
