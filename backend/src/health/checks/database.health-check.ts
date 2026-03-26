import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthCheckResult, HealthCheckType, HealthStatus, HealthCheckLevel } from '../interfaces/health-check.interface';

@Injectable()
export class DatabaseHealthCheck {
  private readonly logger = new Logger(DatabaseHealthCheck.name);

  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test database connection with a simple query
      const result = await this.dataSource.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;

      // Check connection pool status
      const poolStats = this.getPoolStats();

      this.logger.log(`Database health check passed in ${responseTime}ms`);

      return {
        name: 'PostgreSQL',
        type: HealthCheckType.DATABASE,
        status: HealthStatus.UP,
        responseTime,
        timestamp: new Date(),
        level: HealthCheckLevel.INFO,
        details: {
          poolStats,
          queryResult: result,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Database health check failed: ${errorMessage}`);

      return {
        name: 'PostgreSQL',
        type: HealthCheckType.DATABASE,
        status: HealthStatus.DOWN,
        responseTime,
        timestamp: new Date(),
        error: errorMessage,
        level: HealthCheckLevel.CRITICAL,
      };
    }
  }

  private getPoolStats() {
    try {
      // TypeORM connection pool stats
      const driver = this.dataSource.driver;
      return {
        total: driver.master?.['_pool']?.totalCount || 0,
        idle: driver.master?.['_pool']?.idleCount || 0,
        waiting: driver.master?.['_pool']?.waitingCount || 0,
      };
    } catch (error) {
      this.logger.warn('Could not retrieve pool stats:', error);
      return { error: 'Pool stats unavailable' };
    }
  }
}
