export const USECASE_BY_PATH = {
  direct: 'ambient-benchmark-direct',
  ztunnel: 'ambient-benchmark-ztunnel',
  waypoint: 'ambient-benchmark-waypoint',
};

export const NODE_MODES_BY_PATH = {
  direct: ['n/a'],
  ztunnel: ['single', 'multi'],
  waypoint: ['single', 'multi'],
};

export const DEFAULT_TIER_CONCURRENCY = [8, 16, 32, 64, 128, 256, 512];

// The benchmark measures Istio's own overhead (ztunnel/waypoint proxy cost),
// not how the test apps scale - cpuLimit/memoryLimit are left unset on both
// tiers so account-service/ledger-service are never the bottleneck, and
// throughput/latency differences are attributable to the mesh path, not app
// throttling. cpuRequest/memoryRequest still set scheduling priority/QoS.
export const TIER_RESOURCES = {
  default: { cpuRequest: '1000m', cpuLimit: null, memoryRequest: '1Gi', memoryLimit: null },
  scaled: { cpuRequest: '2000m', cpuLimit: null, memoryRequest: '2Gi', memoryLimit: null },
};

export const LOAD_GEN_NODE_LABEL = { key: 'benchmark-role', value: 'loadgen' };

export const NAMESPACE = 'ambient-mesh-benchmark';
export const GATEWAY_NAME = 'ambient-benchmark';
export const GATEWAY_HOSTNAME = 'ambient-benchmark.example.com';
export const TRANSFER_PATH = '/api/v1/transfers';
// Alternated across runs (see run-matrix.js) so the source account doesn't
// monotonically deplete over a long matrix or repeated re-runs - each pair
// of consecutive runs nets to roughly zero balance change.
export const TRANSFER_PAYLOADS = [
  JSON.stringify({ fromAccount: 'acc-001', toAccount: 'acc-002', amount: 1.0, currency: 'USD' }),
  JSON.stringify({ fromAccount: 'acc-002', toAccount: 'acc-001', amount: 1.0, currency: 'USD' }),
];
