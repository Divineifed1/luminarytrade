import { 
  HealthStatus, 
  HealthCheckType, 
  HealthCheckLevel 
} from '../enums/health-status.enum';

export { HealthStatus, HealthCheckType, HealthCheckLevel };

export interface HealthCheckResult {
  name: string;
  type: HealthCheckType;
  status: HealthStatus;
  responseTime: number;
  timestamp: Date;
  error?: string;
  details?: Record<string, any>;
  level: HealthCheckLevel;
  dependencies?: string[];
}

export interface HealthCheckConfig {
  name: string;
  type: HealthCheckType;
  timeout: number;
  interval: number;
  retries: number;
  critical: boolean;
  dependencies?: string[];
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: Date;
  totalChecks: number;
  healthyChecks: number;
  degradedChecks: number;
  failedChecks: number;
  checks: HealthCheckResult[];
  summary: {
    overallResponseTime: number;
    criticalFailures: string[];
    warnings: string[];
  };
}

export interface HealthHistory {
  id: string;
  timestamp: Date;
  status: HealthStatus;
  checkName: string;
  responseTime: number;
  error?: string;
}

export interface DependencyNode {
  name: string;
  type: HealthCheckType;
  status: HealthStatus;
  dependencies: DependencyNode[];
  responseTime: number;
  lastChecked: Date;
}

export interface HealthMetrics {
  uptime: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  averageResponseTime: number;
  last24Hours: HealthHistory[];
  checkMetrics: Map<HealthCheckType, {
    total: number;
    success: number;
    failures: number;
    avgResponseTime: number;
  }>;
}

export interface HealthCheckFunction {
  (): Promise<HealthCheckResult>;
}
