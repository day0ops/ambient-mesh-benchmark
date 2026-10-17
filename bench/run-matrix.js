// bench/run-matrix.js
import { join } from 'path';
import { run } from './lib/exec.js';
import {
  cordonNode,
  uncordonNode,
  waitForDeploymentReady,
  resolveGatewayServiceName,
} from './lib/cluster.js';
import { deployUsecase, patchDeploymentResources } from './lib/meshcli.js';
import { ensureFortioPod, runLoadTest } from './lib/fortio.js';
import { ensureImageRenderer, capturePanel } from './lib/grafana.js';
import { recordRun } from './lib/results.js';
import {
  USECASE_BY_PATH,
  NODE_MODES_BY_PATH,
  NAMESPACE,
  GATEWAY_NAME,
  GATEWAY_HOSTNAME,
  TRANSFER_PATH,
  TRANSFER_PAYLOAD,
} from './config.js';

const SCALED_RESOURCES = { cpu: '2000m', memory: '2Gi' };
const LOAD_TEST_DURATION_SEC = 30;

// 'n/a' (the direct path's nodeMode) contains a '/', which is unsafe in
// filenames and recorded labels. Translate it for recording/labeling only -
// applyNodeMode()'s cordon logic has its own separate 'multi' translation.
function nodeModeLabel(nodeMode) {
  return nodeMode === 'n/a' ? 'none' : nodeMode;
}

async function nonLoadGenNodeNames() {
  const { stdout } = await run('kubectl', [
    'get',
    'nodes',
    '-l',
    '!benchmark-role',
    '-o',
    'jsonpath={.items[*].metadata.name}',
  ]);
  return stdout.trim().split(/\s+/).filter(Boolean);
}

async function applyNodeMode(nodeMode) {
  const names = await nonLoadGenNodeNames();
  if (nodeMode === 'single') {
    await uncordonNode(names[0]);
    for (const name of names.slice(1)) await cordonNode(name);
  } else {
    for (const name of names) await uncordonNode(name);
  }
}

async function captureDashboardPanels(grafanaUrl, grafanaAuth, dashboardPanels, from, to, resultsDir, runLabel) {
  const paths = [];
  for (const panel of dashboardPanels) {
    const outputPath = join(resultsDir, `${runLabel}-${panel.label}.png`);
    const ok = await capturePanel({
      grafanaUrl,
      dashboardUid: panel.dashboardUid,
      panelId: panel.panelId,
      from,
      to,
      outputPath,
      auth: grafanaAuth,
    });
    if (ok) paths.push(outputPath);
  }
  return paths;
}

export async function runMatrix({
  meshFieldKitDir,
  grafanaUrl,
  grafanaAuth,
  resultsDir,
  tier,
  concurrencyLevels,
  dashboardPanels,
  paths = ['direct', 'ztunnel', 'waypoint'],
}) {
  await ensureFortioPod();
  await ensureImageRenderer();

  try {
    for (const path of paths) {
      const usecaseName = USECASE_BY_PATH[path];
      const nodeModes = NODE_MODES_BY_PATH[path];

      for (const nodeMode of nodeModes) {
        await applyNodeMode(nodeMode === 'n/a' ? 'multi' : nodeMode);
        await deployUsecase(usecaseName, meshFieldKitDir);
        await waitForDeploymentReady(NAMESPACE, 'account-service', 180);
        await waitForDeploymentReady(NAMESPACE, 'ledger-service', 180);

        const gatewayServiceName = await resolveGatewayServiceName(NAMESPACE, GATEWAY_NAME);
        const targetHost = `${gatewayServiceName}.${NAMESPACE}.svc.cluster.local`;

        if (tier === 'scaled') {
          await patchDeploymentResources(NAMESPACE, 'account-service', SCALED_RESOURCES);
          await patchDeploymentResources(NAMESPACE, 'ledger-service', SCALED_RESOURCES);
          await waitForDeploymentReady(NAMESPACE, 'account-service', 180);
          await waitForDeploymentReady(NAMESPACE, 'ledger-service', 180);
        }

        for (const concurrency of concurrencyLevels) {
          const startedAt = Date.now();
          const fortioResult = await runLoadTest({
            connections: concurrency,
            durationSec: LOAD_TEST_DURATION_SEC,
            targetHost,
            hostHeader: GATEWAY_HOSTNAME,
            path: TRANSFER_PATH,
            method: 'POST',
            payload: TRANSFER_PAYLOAD,
          });
          const endedAt = Date.now();
          const runLabel = `${path}-${nodeModeLabel(nodeMode)}-${tier}-${concurrency}`;
          const screenshotPaths = await captureDashboardPanels(
            grafanaUrl,
            grafanaAuth,
            dashboardPanels,
            startedAt,
            endedAt,
            resultsDir,
            runLabel
          );
          await recordRun(
            {
              path,
              nodeMode: nodeModeLabel(nodeMode),
              tier,
              concurrency,
              fortioResult,
              screenshotPaths,
              timestamp: new Date(startedAt).toISOString(),
            },
            resultsDir
          );
        }
      }
    }
  } finally {
    for (const name of await nonLoadGenNodeNames()) await uncordonNode(name);
  }
}

if (import.meta.main) {
  const dashboardPanelsPath = new URL('./dashboard-panels.json', import.meta.url).pathname;
  const dashboardPanels = JSON.parse(await Bun.file(dashboardPanelsPath).text());
  await runMatrix({
    meshFieldKitDir: process.env.MESH_FIELD_KIT_DIR,
    grafanaUrl: process.env.GRAFANA_URL,
    grafanaAuth: {
      username: process.env.GRAFANA_ADMIN_USERNAME,
      password: process.env.GRAFANA_ADMIN_PASSWORD,
    },
    resultsDir: process.env.BENCH_RESULTS_DIR || './results',
    tier: process.env.BENCH_TIER || 'default',
    concurrencyLevels: (process.env.BENCH_CONCURRENCY || '8,16,32,64,128,256,512')
      .split(',')
      .map(Number),
    dashboardPanels,
    paths: (process.env.BENCH_PATHS || 'direct,ztunnel,waypoint').split(','),
  });
}
