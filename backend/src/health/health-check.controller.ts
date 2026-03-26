import { 
  Controller, 
  Get, 
  HttpCode, 
  HttpStatus, 
  Res,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { HealthCheckService } from './health-check.service';
import { HealthReport, HealthStatus } from './interfaces/health-check.interface';

@Controller('health')
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  /**
   * Simple liveness probe - returns 200 if service is running
   * Used by Kubernetes for basic liveness checks
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async liveness(@Res() res: Response) {
    try {
      const result = await this.healthCheckService.checkLiveness();
      
      if (result.status === 'SHUTTING_DOWN') {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          status: result.status,
          timestamp: result.timestamp,
        });
      }

      res.status(HttpStatus.OK).json({
        status: result.status,
        timestamp: result.timestamp,
      });
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Readiness probe - checks all dependencies before allowing traffic
   * Used by Kubernetes to determine when pod is ready
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness(@Res() res: Response) {
    try {
      const report = await this.healthCheckService.checkReadiness();
      
      const statusCode = report.status === HealthStatus.UP ? 
        HttpStatus.OK : 
        HttpStatus.SERVICE_UNAVAILABLE;

      res.status(statusCode).json({
        status: report.status,
        timestamp: report.timestamp,
        summary: {
          total: report.totalChecks,
          healthy: report.healthyChecks,
          degraded: report.degradedChecks,
          failed: report.failedChecks,
        },
        criticalFailures: report.summary.criticalFailures,
        warnings: report.summary.warnings,
        responseTime: report.summary.overallResponseTime,
      });
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Detailed health check - includes all dependency details and metrics
   * Used for monitoring dashboards and detailed diagnostics
   */
  @Get('detailed')
  @HttpCode(HttpStatus.OK)
  async detailed(@Res() res: Response) {
    try {
      const report = await this.healthCheckService.checkDetailed();
      const metrics = this.healthCheckService.getMetrics();
      
      const statusCode = report.status === HealthStatus.UP ? 
        HttpStatus.OK : 
        HttpStatus.SERVICE_UNAVAILABLE;

      res.status(statusCode).json({
        status: report.status,
        timestamp: report.timestamp,
        uptime: metrics.uptime,
        summary: {
          total: report.totalChecks,
          healthy: report.healthyChecks,
          degraded: report.degradedChecks,
          failed: report.failedChecks,
          overallResponseTime: report.summary.overallResponseTime,
          criticalFailures: report.summary.criticalFailures,
          warnings: report.summary.warnings,
        },
        checks: report.checks.map(check => ({
          name: check.name,
          type: check.type,
          status: check.status,
          responseTime: check.responseTime,
          level: check.level,
          error: check.error,
          lastChecked: check.timestamp,
        })),
        metrics: {
          totalChecks: metrics.totalChecks,
          successfulChecks: metrics.successfulChecks,
          failedChecks: metrics.failedChecks,
          averageResponseTime: metrics.averageResponseTime,
          last24Hours: {
            total: metrics.last24Hours.length,
            status: this.get24HourStatus(metrics.last24Hours),
          },
        },
      });
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Dependency graph visualization
   * Shows relationships between different services and their health status
   */
  @Get('dependencies')
  @HttpCode(HttpStatus.OK)
  async dependencies(@Res() res: Response) {
    try {
      const graph = await this.healthCheckService.getDependencyGraph();
      
      res.status(HttpStatus.OK).json({
        timestamp: new Date().toISOString(),
        graph: {
          nodes: graph.nodes,
          edges: graph.edges,
        },
        summary: {
          totalNodes: graph.nodes.length,
          totalEdges: graph.edges.length,
          healthyNodes: graph.nodes.filter(n => n.status === HealthStatus.UP).length,
          degradedNodes: graph.nodes.filter(n => n.status === HealthStatus.DEGRADED).length,
          failedNodes: graph.nodes.filter(n => n.status === HealthStatus.DOWN).length,
        },
      });
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check specific dependency
   * Useful for targeted troubleshooting
   */
  @Get('check/:dependency')
  @HttpCode(HttpStatus.OK)
  async checkDependency(
    @Res() res: Response,
    @Query('timeout') timeout?: string,
  ) {
    try {
      const dependencyName = res.req.params?.dependency;
      
      if (!dependencyName) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Dependency name is required',
        });
      }

      const result = await this.healthCheckService.checkDependency(dependencyName);
      
      if (!result) {
        return res.status(HttpStatus.NOT_FOUND).json({
          error: `Dependency '${dependencyName}' not found`,
        });
      }

      res.status(HttpStatus.OK).json({
        name: result.name,
        type: result.type,
        status: result.status,
        responseTime: result.responseTime,
        timestamp: result.timestamp,
        level: result.level,
        error: result.error,
        details: result.details,
      });
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Health metrics and statistics
   * Provides historical data and performance metrics
   */
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  async metrics(@Res() res: Response) {
    try {
      const metrics = this.healthCheckService.getMetrics();
      
      res.status(HttpStatus.OK).json({
        timestamp: new Date().toISOString(),
        uptime: metrics.uptime,
        summary: {
          totalChecks: metrics.totalChecks,
          successfulChecks: metrics.successfulChecks,
          failedChecks: metrics.failedChecks,
          averageResponseTime: metrics.averageResponseTime,
          successRate: metrics.totalChecks > 0 ? 
            (metrics.successfulChecks / metrics.totalChecks * 100).toFixed(2) + '%' : 
            '0%',
        },
        last24Hours: {
          total: metrics.last24Hours.length,
          status: this.get24HourStatus(metrics.last24Hours),
          history: metrics.last24Hours.slice(-50), // Last 50 entries
        },
        byType: Array.from(metrics.checkMetrics.entries()).map(([type, stats]) => ({
          type,
          total: stats.total,
          success: stats.success,
          failures: stats.failures,
          successRate: stats.total > 0 ? 
            (stats.success / stats.total * 100).toFixed(2) + '%' : 
            '0%',
          averageResponseTime: stats.avgResponseTime.toFixed(2) + 'ms',
        })),
      });
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private get24HourStatus(history: any[]): string {
    if (history.length === 0) return 'NO_DATA';
    
    const recent = history.slice(-10); // Last 10 checks
    const failures = recent.filter(h => h.status !== HealthStatus.UP).length;
    
    if (failures === 0) return 'STABLE';
    if (failures <= 2) return 'MOSTLY_STABLE';
    if (failures <= 5) return 'DEGRADING';
    return 'UNSTABLE';
  }
}
