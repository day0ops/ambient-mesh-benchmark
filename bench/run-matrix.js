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
  TRANSFER_PAYLOADS,
  LOAD_GEN_NODE_LABEL,
  TIER_RESOURCES,
} from './config.js';

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
    `!${LOAD_GEN_NODE_LABEL.key}`,
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

  // Alternates the transfer direction between consecutive runs so the source
  // account doesn't monotonically deplete over a long matrix or repeated
  // re-runs - see TRANSFER_PAYLOADS in config.js.
  let runCount = 0;

  let mainError;
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

        const tierResources = TIER_RESOURCES[tier];
        if (!tierResources) {
          throw new Error(`runMatrix: unknown tier '${tier}' (expected one of ${Object.keys(TIER_RESOURCES).join(', ')})`);
        }
        await patchDeploymentResources(NAMESPACE, 'account-service', tierResources);
        await patchDeploymentResources(NAMESPACE, 'ledger-service', tierResources);
        await waitForDeploymentReady(NAMESPACE, 'account-service', 180);
        await waitForDeploymentReady(NAMESPACE, 'ledger-service', 180);

        for (const concurrency of pendingConcurrency) {
          const startedAt = Date.now();
          const fortioResult = await runLoadTest({
            connections: concurrency,
            durationSec: LOAD_TEST_DURATION_SEC,
            targetHost,
            hostHeader: GATEWAY_HOSTNAME,
            path: TRANSFER_PATH,
            method: 'POST',
            payload: TRANSFER_PAYLOADS[runCount % TRANSFER_PAYLOADS.length],
          });
          runCount += 1;
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
  } catch (err) {
    mainError = err;
    throw err;
  } finally {
    try {
      const names = await nonLoadGenNodeNames();
      const results = await Promise.allSettled(names.map(name => uncordonNode(name)));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    } catch (cleanupError) {
      // Only swallow a cleanup failure when the main path already failed -
      // otherwise it would mask the original error. If the main path
      // succeeded, a failed uncordon must still surface: it leaves cluster
      // capacity reduced and skews the next run's node-mode semantics.
      if (mainError) {
        console.error('runMatrix: failed to uncordon nodes during cleanup:', cleanupError.message);
      } else {
        throw cleanupError;
      }
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
