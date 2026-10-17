// bench/lib/grafana.test.js
import { test, expect, mock } from 'bun:test';

test('ensureImageRenderer applies the manifest and patches Grafana env vars', async () => {
  const calls = [];
  mock.module('./exec.js', () => ({
    run: async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  }));
  const { ensureImageRenderer } = await import('./grafana.js');
  await ensureImageRenderer();
  expect(calls[0]).toEqual({
    cmd: 'kubectl',
    args: ['apply', '-f', expect.stringContaining('grafana-image-renderer.yaml')],
  });
  expect(calls[1]).toEqual({
    cmd: 'kubectl',
    args: [
      'set',
      'env',
      'deployment/kube-prometheus-stack-grafana',
      '-n',
      'telemetry',
      'GF_RENDERING_SERVER_URL=http://grafana-image-renderer.telemetry.svc.cluster.local:8081/render',
      'GF_RENDERING_CALLBACK_URL=http://kube-prometheus-stack-grafana.telemetry.svc.cluster.local/',
    ],
  });
  expect(calls[2]).toEqual({
    cmd: 'kubectl',
    args: [
      'rollout',
      'status',
      'deployment/kube-prometheus-stack-grafana',
      '-n',
      'telemetry',
      '--timeout=120s',
    ],
  });
});

test('capturePanel fetches the render URL and writes the PNG, returning true on success', async () => {
  const writtenFiles = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    expect(url).toContain('/render/d-solo/abc123');
    expect(url).toContain('panelId=4');
    expect(url).toContain('from=1000');
    expect(url).toContain('to=2000');
    return {
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  };
  const originalWrite = Bun.write;
  Bun.write = async (path, data) => {
    writtenFiles[path] = data;
    return 3;
  };
  try {
    const { capturePanel } = await import('./grafana.js');
    const result = await capturePanel({
      grafanaUrl: 'http://grafana.example.com',
      dashboardUid: 'abc123',
      panelId: 4,
      from: 1000,
      to: 2000,
      outputPath: '/tmp/panel.png',
      auth: { username: 'admin', password: 'secret' },
    });
    expect(result).toBe(true);
    expect(writtenFiles['/tmp/panel.png']).toBeDefined();
  } finally {
    globalThis.fetch = originalFetch;
    Bun.write = originalWrite;
  }
});

test('capturePanel returns false (does not throw) when the fetch fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  try {
    const { capturePanel } = await import('./grafana.js');
    const result = await capturePanel({
      grafanaUrl: 'http://grafana.example.com',
      dashboardUid: 'abc123',
      panelId: 4,
      from: 1000,
      to: 2000,
      outputPath: '/tmp/panel.png',
      auth: { username: 'admin', password: 'secret' },
    });
    expect(result).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
