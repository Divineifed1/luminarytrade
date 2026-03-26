import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckResult, HealthCheckType, HealthStatus, HealthCheckLevel } from '../interfaces/health-check.interface';

@Injectable()
export class RedisHealthCheck {
  private readonly logger = new Logger(RedisHealthCheck.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Get Redis configuration
      const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
      const redisPort = this.configService.get<string>('REDIS_PORT', '6379');
      
      // Simulate Redis ping check (in real implementation, you'd use Redis client)
      const isRedisAvailable = await this.pingRedis(redisHost, parseInt(redisPort));
      const responseTime = Date.now() - startTime;

      if (!isRedisAvailable) {
        throw new Error('Redis ping failed');
      }

      // Get Redis memory usage (simulated)
      const memoryInfo = await this.getMemoryInfo();

      this.logger.log(`Redis health check passed in ${responseTime}ms`);

      return {
        name: 'Redis',
        type: HealthCheckType.REDIS,
        status: HealthStatus.UP,
        responseTime,
        timestamp: new Date(),
        level: HealthCheckLevel.INFO,
        details: {
          host: redisHost,
          port: redisPort,
          memoryInfo,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Redis health check failed: ${errorMessage}`);

      return {
        name: 'Redis',
        type: HealthCheckType.REDIS,
        status: HealthStatus.DOWN,
        responseTime,
        timestamp: new Date(),
        error: errorMessage,
        level: HealthCheckLevel.CRITICAL,
      };
    }
  }

  private async pingRedis(host: string, port: number): Promise<boolean> {
    try {
      // In a real implementation, you would use Redis client:
      // await this.redisClient.ping();
      
      // For now, simulate a connection check
      // This would be replaced with actual Redis client ping
      return new Promise((resolve) => {
        const socket = require('net').createConnection(port, host);
        
        socket.setTimeout(5000);
        
        socket.on('connect', () => {
          socket.write('PING\r\n');
        });
        
        socket.on('data', (data) => {
          if (data.toString().includes('PONG')) {
            socket.end();
            resolve(true);
          }
        });
        
        socket.on('error', () => {
          resolve(false);
        });
        
        socket.on('timeout', () => {
          socket.end();
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  private async getMemoryInfo(): Promise<Record<string, any>> {
    try {
      // In a real implementation, you would use Redis INFO command:
      // const info = await this.redisClient.info('memory');
      // return this.parseMemoryInfo(info);
      
      // For now, return simulated data
      return {
        usedMemory: Math.floor(Math.random() * 100000000), // bytes
        usedMemoryHuman: this.formatBytes(Math.floor(Math.random() * 100000000)),
        maxMemory: 134217728, // 128MB
        maxMemoryHuman: '128.00M',
        memoryUsagePercentage: Math.floor(Math.random() * 100),
      };
    } catch (error) {
      return { error: 'Memory info unavailable' };
    }
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}
