// bench/lib/grafana.js
import { run } from './exec.js';

const NAMESPACE = 'telemetry';
const GRAFANA_DEPLOYMENT = 'kube-prometheus-stack-grafana';
const RENDERER_MANIFEST_PATH = new URL(
  '../manifests/grafana-image-renderer.yaml',
  import.meta.url
).pathname;

export async function ensureImageRenderer() {
  await run('kubectl', ['apply', '-f', RENDERER_MANIFEST_PATH]);
  await run('kubectl', [
    'set',
    'env',
    `deployment/${GRAFANA_DEPLOYMENT}`,
    '-n',
    NAMESPACE,
    'GF_RENDERING_SERVER_URL=http://grafana-image-renderer.telemetry.svc.cluster.local:8081/render',
    `GF_RENDERING_CALLBACK_URL=http://${GRAFANA_DEPLOYMENT}.telemetry.svc.cluster.local/`,
  ]);
  await run('kubectl', [
    'rollout',
    'status',
    `deployment/${GRAFANA_DEPLOYMENT}`,
    '-n',
    NAMESPACE,
    '--timeout=120s',
  ]);
}

export async function capturePanel({ grafanaUrl, dashboardUid, panelId, from, to, outputPath, auth }) {
  try {
    const url = `${grafanaUrl}/render/d-solo/${dashboardUid}?panelId=${panelId}&from=${from}&to=${to}&width=1000&height=500`;
    const authHeader = 'Basic ' + Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    const response = await fetch(url, { headers: { Authorization: authHeader } });
    if (!response.ok) {
      console.warn(`Grafana render failed (${response.status}) for ${url}`);
      return false;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await Bun.write(outputPath, bytes);
    return true;
  } catch (error) {
    console.warn(`Grafana capture error: ${error.message}`);
    return false;
  }
}
