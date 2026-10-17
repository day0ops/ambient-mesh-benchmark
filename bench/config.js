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

export const LOAD_GEN_NODE_LABEL = { key: 'benchmark-role', value: 'loadgen' };

export const NAMESPACE = 'ambient-mesh-benchmark';
export const GATEWAY_NAME = 'ambient-benchmark';
export const GATEWAY_HOSTNAME = 'ambient-benchmark.example.com';
export const TRANSFER_PATH = '/api/v1/transfers';
export const TRANSFER_PAYLOAD = JSON.stringify({
  fromAccount: 'acc-001',
  toAccount: 'acc-002',
  amount: 1.0,
  currency: 'USD',
});
