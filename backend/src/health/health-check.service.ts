import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { 
  HealthCheckResult, 
  HealthReport, 
  HealthMetrics, 
  HealthHistory, 
  HealthCheckFunction,
  HealthCheckConfig,
  HealthStatus,
  HealthCheckType,
  HealthCheckLevel
} from './interfaces/health-check.interface';
import { DatabaseHealthCheck } from './checks/database.health-check';
import { RedisHealthCheck } from './checks/redis.health-check';
import { StellarRpcHealthCheck } from './checks/stellar-rpc.health-check';
import { AiProviderHealthCheck } from './checks/ai-provider.health-check';
import { BullQueueHealthCheck } from './checks/bull-queue.health-check';
import { SystemHealthCheck } from './checks/system-health-check';

@Injectable()
export class HealthCheckService implements OnModuleInit {
  private readonly logger = new Logger(HealthCheckService.name);
  private healthChecks: Map<string, HealthCheckFunction> = new Map();
  private healthHistory: HealthHistory[] = [];
  private customHealthChecks: Map<string, HealthCheckFunction> = new Map();
  private isShuttingDown = false;
  private startTime = Date.now();
  private metrics: HealthMetrics;

  constructor(
    private readonly databaseHealthCheck: DatabaseHealthCheck,
    private readonly redisHealthCheck: RedisHealthCheck,
    private readonly stellarRpcHealthCheck: StellarRpcHealthCheck,
    private readonly aiProviderHealthCheck: AiProviderHealthCheck,
    private readonly bullQueueHealthCheck: BullQueueHealthCheck,
    private readonly systemHealthCheck: SystemHealthCheck,
  ) {
    this.metrics = {
      uptime: 0,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      last24Hours: [],
      checkMetrics: new Map(),
    };
  }

  async onModuleInit() {
    this.logger.log('Initializing Health Check Service...');
    
    // Register built-in health checks
    this.registerHealthChecks();
    
    // Start continuous health monitoring
    this.startContinuousMonitoring();
    
    this.logger.log(`Health Check Service initialized with ${this.healthChecks.size} health checks`);
  }

  private registerHealthChecks() {
    // Database checks
    this.healthChecks.set('database', () => this.databaseHealthCheck.check());
    
    // Redis checks
    this.healthChecks.set('redis', () => this.redisHealthCheck.check());
    
    // Stellar RPC checks
    this.healthChecks.set('stellar-rpc', () => this.stellarRpcHealthCheck.check());
    
    // AI Provider checks
    this.healthChecks.set('ai-provider', () => this.aiProviderHealthCheck.check());
    
    // Bull Queue checks
    this.healthChecks.set('bull-queue', () => this.bullQueueHealthCheck.check());
    
    // System checks
    this.healthChecks.set('disk-space', () => this.systemHealthCheck.checkDiskSpace());
    this.healthChecks.set('memory', () => this.systemHealthCheck.checkMemory());
  }

  async checkLiveness(): Promise<{ status: string; timestamp: string }> {
    if (this.isShuttingDown) {
      return {
        status: 'SHUTTING_DOWN',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
    };
  }

  async checkReadiness(): Promise<HealthReport> {
    const results = await this.runAllHealthChecks();
    return this.generateHealthReport(results);
  }

  async checkDetailed(): Promise<HealthReport> {
    const results = await this.runAllHealthChecks();
    const report = this.generateHealthReport(results);
    
    // Add additional metrics
    (report as any).metrics = this.metrics;
    (report as any).uptime = this.getUptime();
    
    return report;
  }

  async checkDependency(dependencyName: string): Promise<HealthCheckResult | null> {
    const healthCheck = this.healthChecks.get(dependencyName) || 
                      this.customHealthChecks.get(dependencyName);
    
    if (!healthCheck) {
      return null;
    }

    try {
      return await healthCheck();
    } catch (error) {
      this.logger.error(`Health check failed for ${dependencyName}:`, error);
      return {
        name: dependencyName,
        type: HealthCheckType.CUSTOM,
        status: HealthStatus.DOWN,
        responseTime: 0,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
        level: HealthCheckLevel.CRITICAL,
      };
    }
  }

  async getDependencyGraph(): Promise<{ nodes: any[], edges: any[] }> {
    const results = await this.runAllHealthChecks();
    
    const nodes = results.map(result => ({
      id: result.name,
      label: result.name,
      type: result.type,
      status: result.status,
      responseTime: result.responseTime,
      lastChecked: result.timestamp,
    }));

    // Define dependencies (this would be configurable based on your architecture)
    const edges = [
      { from: 'database', to: 'AI Provider' },
      { from: 'redis', to: 'AI Provider' },
      { from: 'AI Provider', to: 'Bull Queues' },
      { from: 'stellar-rpc', to: 'AI Provider' },
    ];

    return { nodes, edges };
  }

  registerCustomHealthCheck(name: string, healthCheck: HealthCheckFunction) {
    this.customHealthChecks.set(name, healthCheck);
    this.logger.log(`Registered custom health check: ${name}`);
  }

  private async runAllHealthChecks(): Promise<HealthCheckResult[]> {
    const checkPromises = Array.from(this.healthChecks.entries()).map(async ([name, checkFn]) => {
      try {
        const result = await Promise.race([
          checkFn(),
          this.timeout(10000), // 10 second timeout per check
        ]);
        
        this.updateMetrics(result);
        return result;
      } catch (error) {
        const errorResult: HealthCheckResult = {
          name,
          type: HealthCheckType.CUSTOM,
          status: HealthStatus.DOWN,
          responseTime: 10000,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : String(error),
          level: HealthCheckLevel.CRITICAL,
        };
        
        this.updateMetrics(errorResult);
        return errorResult;
      }
    });

    const customCheckPromises = Array.from(this.customHealthChecks.entries()).map(async ([name, checkFn]) => {
      try {
        const result = await Promise.race([
          checkFn(),
          this.timeout(10000),
        ]);
        
        this.updateMetrics(result);
        return result;
      } catch (error) {
        const errorResult: HealthCheckResult = {
          name,
          type: HealthCheckType.CUSTOM,
          status: HealthStatus.DOWN,
          responseTime: 10000,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : String(error),
          level: HealthCheckLevel.CRITICAL,
        };
        
        this.updateMetrics(errorResult);
        return errorResult;
      }
    });

    return await Promise.all([...checkPromises, ...customCheckPromises]);
  }

  private generateHealthReport(results: HealthCheckResult[]): HealthReport {
    const totalChecks = results.length;
    const healthyChecks = results.filter(r => r.status === HealthStatus.UP).length;
    const degradedChecks = results.filter(r => r.status === HealthStatus.DEGRADED).length;
    const failedChecks = results.filter(r => r.status === HealthStatus.DOWN).length;

    // Determine overall status
    let overallStatus = HealthStatus.UP;
    if (failedChecks > 0) {
      overallStatus = HealthStatus.DOWN;
    } else if (degradedChecks > 0) {
      overallStatus = HealthStatus.DEGRADED;
    }

    const criticalFailures = results
      .filter(r => r.level === HealthCheckLevel.CRITICAL && r.status !== HealthStatus.UP)
      .map(r => r.name);

    const warnings = results
      .filter(r => r.level === HealthCheckLevel.WARNING && r.status !== HealthStatus.UP)
      .map(r => r.name);

    const overallResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / totalChecks;

    return {
      status: overallStatus,
      timestamp: new Date(),
      totalChecks,
      healthyChecks,
      degradedChecks,
      failedChecks,
      checks: results,
      summary: {
        overallResponseTime,
        criticalFailures,
        warnings,
      },
    };
  }

  private updateMetrics(result: HealthCheckResult) {
    this.metrics.totalChecks++;
    
    if (result.status === HealthStatus.UP) {
      this.metrics.successfulChecks++;
    } else {
      this.metrics.failedChecks++;
    }

    // Update average response time
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.totalChecks - 1) + result.responseTime) / 
      this.metrics.totalChecks;

    // Update type-specific metrics
    const existing = this.metrics.checkMetrics.get(result.type) || {
      total: 0,
      success: 0,
      failures: 0,
      avgResponseTime: 0,
    };

    existing.total++;
    if (result.status === HealthStatus.UP) {
      existing.success++;
    } else {
      existing.failures++;
    }

    existing.avgResponseTime = 
      (existing.avgResponseTime * (existing.total - 1) + result.responseTime) / existing.total;

    this.metrics.checkMetrics.set(result.type, existing);

    // Add to history (keep only last 24 hours)
    const historyEntry: HealthHistory = {
      id: `${result.name}-${Date.now()}`,
      timestamp: result.timestamp,
      status: result.status,
      checkName: result.name,
      responseTime: result.responseTime,
      error: result.error,
    };

    this.healthHistory.push(historyEntry);
    
    // Clean old history entries
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.healthHistory = this.healthHistory.filter(h => h.timestamp > twentyFourHoursAgo);
    this.metrics.last24Hours = [...this.healthHistory];
  }

  private startContinuousMonitoring() {
    // Run health checks every 30 seconds
    setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.runAllHealthChecks();
      }
    }, 30000);
  }

  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Health check timeout after ${ms}ms`)), ms);
    });
  }

  async onApplicationShutdown() {
    this.isShuttingDown = true;
    this.logger.log('Health Check Service is shutting down');
  }

  getMetrics(): HealthMetrics {
    return {
      ...this.metrics,
      uptime: this.getUptime(),
    };
  }
}
