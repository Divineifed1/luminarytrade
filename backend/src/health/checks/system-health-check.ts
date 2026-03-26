import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckResult, HealthCheckType, HealthStatus, HealthCheckLevel } from '../interfaces/health-check.interface';
import * as fs from 'fs/promises';
import * as os from 'os';

@Injectable()
export class SystemHealthCheck {
  private readonly logger = new Logger(SystemHealthCheck.name);

  async checkDiskSpace(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const diskStats = await this.getDiskStats();
      const responseTime = Date.now() - startTime;

      // Determine health based on disk usage
      let status = HealthStatus.UP;
      let level = HealthCheckLevel.INFO;
      
      if (diskStats.usagePercentage > 90) {
        status = HealthStatus.DOWN;
        level = HealthCheckLevel.CRITICAL;
      } else if (diskStats.usagePercentage > 80) {
        status = HealthStatus.DEGRADED;
        level = HealthCheckLevel.WARNING;
      }

      this.logger.log(`Disk space health check passed in ${responseTime}ms - Usage: ${diskStats.usagePercentage}%`);

      return {
        name: 'Disk Space',
        type: HealthCheckType.DISK_SPACE,
        status,
        responseTime,
        timestamp: new Date(),
        level,
        details: diskStats,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Disk space health check failed: ${errorMessage}`);

      return {
        name: 'Disk Space',
        type: HealthCheckType.DISK_SPACE,
        status: HealthStatus.DOWN,
        responseTime,
        timestamp: new Date(),
        error: errorMessage,
        level: HealthCheckLevel.CRITICAL,
      };
    }
  }

  async checkMemory(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const memoryStats = this.getMemoryStats();
      const responseTime = Date.now() - startTime;

      // Determine health based on memory usage
      let status = HealthStatus.UP;
      let level = HealthCheckLevel.INFO;
      
      if (memoryStats.usagePercentage > 95) {
        status = HealthStatus.DOWN;
        level = HealthCheckLevel.CRITICAL;
      } else if (memoryStats.usagePercentage > 85) {
        status = HealthStatus.DEGRADED;
        level = HealthCheckLevel.WARNING;
      }

      this.logger.log(`Memory health check passed in ${responseTime}ms - Usage: ${memoryStats.usagePercentage}%`);

      return {
        name: 'Memory',
        type: HealthCheckType.MEMORY,
        status,
        responseTime,
        timestamp: new Date(),
        level,
        details: memoryStats,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Memory health check failed: ${errorMessage}`);

      return {
        name: 'Memory',
        type: HealthCheckType.MEMORY,
        status: HealthStatus.DOWN,
        responseTime,
        timestamp: new Date(),
        error: errorMessage,
        level: HealthCheckLevel.CRITICAL,
      };
    }
  }

  private async getDiskStats(): Promise<Record<string, any>> {
    try {
      const stats = await fs.statfs('/');
      const totalSpace = stats.blocks * stats.blksize;
      const freeSpace = stats.bavail * stats.blksize;
      const usedSpace = totalSpace - freeSpace;
      const usagePercentage = Math.round((usedSpace / totalSpace) * 100);

      return {
        total: this.formatBytes(totalSpace),
        used: this.formatBytes(usedSpace),
        free: this.formatBytes(freeSpace),
        usagePercentage,
        path: '/',
      };
    } catch (error) {
      throw new Error(`Failed to get disk stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getMemoryStats(): Record<string, any> {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const usagePercentage = Math.round((usedMem / totalMem) * 100);

      return {
        total: this.formatBytes(totalMem),
        used: this.formatBytes(usedMem),
        free: this.formatBytes(freeMem),
        usagePercentage,
        systemLoad: os.loadavg(),
        uptime: os.uptime(),
      };
    } catch (error) {
      throw new Error(`Failed to get memory stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}
