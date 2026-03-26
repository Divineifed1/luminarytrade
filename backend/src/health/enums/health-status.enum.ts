export enum HealthStatus {
  UP = 'UP',
  DEGRADED = 'DEGRADED',
  DOWN = 'DOWN',
}

export enum HealthCheckType {
  DATABASE = 'DATABASE',
  REDIS = 'REDIS',
  STELLAR_RPC = 'STELLAR_RPC',
  AI_PROVIDER = 'AI_PROVIDER',
  BULL_QUEUE = 'BULL_QUEUE',
  DISK_SPACE = 'DISK_SPACE',
  MEMORY = 'MEMORY',
  CUSTOM = 'CUSTOM',
}

export enum HealthCheckLevel {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  INFO = 'INFO',
}
