// bench/run-matrix.js
import { join } from 'path';
import { run } from './lib/exec.js';
import {
  cordonNode,
  uncordonNode,
  ensureLoadGenNode,
  waitForDeploymentReady,
  resolveGatewayServiceName,
} from './lib/cluster.js';
import { deployUsecase, patchDeploymentResources } from './lib/meshcli.js';
import { ensureFortioPod, runLoadTest } from './lib/fortio.js';
import { ensureImageRenderer, capturePanel } from './lib/grafana.js';
import { recordRun, resultExists } from './lib/results.js';
import {
  USECASE_BY_PATH,
  NODE_MODES_BY_PATH,
  DEFAULT_TIER_CONCURRENCY,
  NAMESPACE,
  GATEWAY_NAME,
  GATEWAY_HOSTNAME,
  TRANSFER_PATH,
  TRANSFER_PAYLOAD,
} from './config.js';

const SCALED_RESOURCES = { cpu: '2000m', memory: '2Gi' };
const LOAD_TEST_DURATION_SEC = 30;
// Gives Prometheus a chance to scrape the final data points before the
// Grafana panel capture window closes - scrape intervals of 15-30s can
// otherwise leave a run's screenshot with only 1-2 samples.
const DEFAULT_GRAFANA_SETTLE_MS = 5000;

const REQUIRED_CONFIG = [
  { key: 'meshFieldKitDir', envVar: 'MESH_FIELD_KIT_DIR' },
  { key: 'grafanaUrl', envVar: 'GRAFANA_URL' },
];
const REQUIRED_GRAFANA_AUTH = [
  { key: 'username', envVar: 'GRAFANA_ADMIN_USERNAME' },
  { key: 'password', envVar: 'GRAFANA_ADMIN_PASSWORD' },
];

// Fails fast with a clear error naming the missing env var(s) instead of
// failing later and confusingly (wrong cwd, fetch to 'undefined/...').
function assertRequiredConfig({ meshFieldKitDir, grafanaUrl, grafanaAuth }) {
  const resolved = { meshFieldKitDir, grafanaUrl };
  const missing = REQUIRED_CONFIG.filter(({ key }) => !resolved[key]).map(({ envVar }) => envVar);
  for (const { key, envVar } of REQUIRED_GRAFANA_AUTH) {
    if (!grafanaAuth?.[key]) missing.push(envVar);
  }
  if (missing.length > 0) {
    throw new Error(`runMatrix: missing required configuration (${missing.join(', ')})`);
  }
}

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
  grafanaSettleMs = DEFAULT_GRAFANA_SETTLE_MS,
}) {
  assertRequiredConfig({ meshFieldKitDir, grafanaUrl, grafanaAuth });

  await ensureLoadGenNode();
  await ensureFortioPod();
  await ensureImageRenderer();

  try {
    for (const path of paths) {
      const usecaseName = USECASE_BY_PATH[path];
      const nodeModes = NODE_MODES_BY_PATH[path];

      for (const nodeMode of nodeModes) {
        const label = nodeModeLabel(nodeMode);

        // Resume support: skip combinations already recorded by a prior run
        // (e.g. before a crash) instead of re-running the whole matrix.
        const pendingConcurrency = [];
        for (const concurrency of concurrencyLevels) {
          if (await resultExists(resultsDir, path, label, tier, concurrency)) {
            console.log(`Skipping ${path}-${label}-${tier}-${concurrency}: result already exists`);
          } else {
            pendingConcurrency.push(concurrency);
          }
        }
        if (pendingConcurrency.length === 0) {
          console.log(`Skipping ${path}-${label}-${tier}: all concurrency levels already recorded`);
          continue;
        }

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

        for (const concurrency of pendingConcurrency) {
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
          if (grafanaSettleMs > 0) await Bun.sleep(grafanaSettleMs);
          const runLabel = `${path}-${label}-${tier}-${concurrency}`;
          const screenshotPaths = await captureDashboardPanels(
            grafanaUrl,
            grafanaAuth,
            dashboardPanels,
            startedAt,
            endedAt + grafanaSettleMs,
            resultsDir,
            runLabel
          );
          await recordRun(
            {
              path,
              nodeMode: label,
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
    try {
      for (const name of await nonLoadGenNodeNames()) await uncordonNode(name);
    } catch (cleanupError) {
      console.error('runMatrix: failed to uncordon nodes during cleanup:', cleanupError.message);
    }
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
    concurrencyLevels: (process.env.BENCH_CONCURRENCY || DEFAULT_TIER_CONCURRENCY.join(','))
      .split(',')
      .map(Number),
    dashboardPanels,
    paths: (process.env.BENCH_PATHS || 'direct,ztunnel,waypoint').split(','),
  });
}
