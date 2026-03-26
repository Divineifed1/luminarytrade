import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { HealthCheckResult, HealthCheckType, HealthStatus, HealthCheckLevel } from '../interfaces/health-check.interface';

@Injectable()
export class BullQueueHealthCheck {
  private readonly logger = new Logger(BullQueueHealthCheck.name);

  constructor(
    @InjectQueue('default') private readonly defaultQueue: Queue,
    @InjectQueue('submitter') private readonly submitterQueue: Queue,
    @InjectQueue('simulator') private readonly simulatorQueue: Queue,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const queueStats = await this.getAllQueueStats();
      const responseTime = Date.now() - startTime;

      // Determine overall health based on queue depths and worker counts
      const totalJobs = queueStats.reduce((sum, queue) => sum + queue.waiting + queue.active, 0);
      const totalWorkers = queueStats.reduce((sum, queue) => sum + queue.workers, 0);
      
      let status = HealthStatus.UP;
      let level = HealthCheckLevel.INFO;
      
      // Check for queue congestion
      if (totalJobs > 1000) {
        status = HealthStatus.DEGRADED;
        level = HealthCheckLevel.WARNING;
      }
      
      // Check for worker issues
      if (totalWorkers === 0) {
        status = HealthStatus.DOWN;
        level = HealthCheckLevel.CRITICAL;
      }

      this.logger.log(`Bull Queue health check passed in ${responseTime}ms - Status: ${status}`);

      return {
        name: 'Bull Queues',
        type: HealthCheckType.BULL_QUEUE,
        status,
        responseTime,
        timestamp: new Date(),
        level,
        details: {
          queueStats,
          totalJobs,
          totalWorkers,
          summary: {
            totalQueues: queueStats.length,
            activeQueues: queueStats.filter(q => q.active > 0).length,
            congestedQueues: queueStats.filter(q => q.waiting > 100).length,
          },
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Bull Queue health check failed: ${errorMessage}`);

      return {
        name: 'Bull Queues',
        type: HealthCheckType.BULL_QUEUE,
        status: HealthStatus.DOWN,
        responseTime,
        timestamp: new Date(),
        error: errorMessage,
        level: HealthCheckLevel.CRITICAL,
      };
    }
  }

  private async getAllQueueStats(): Promise<Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    workers: number;
  }>> {
    const queues = [
      { queue: this.defaultQueue, name: 'default' },
      { queue: this.submitterQueue, name: 'submitter' },
      { queue: this.simulatorQueue, name: 'simulator' },
    ];

    const stats = await Promise.allSettled(
      queues.map(async ({ queue, name }) => {
        try {
          const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getCompleted(),
            queue.getFailed(),
            queue.getDelayed(),
            queue.getPaused(),
          ]);

          const workers = await queue.getWorkers();

          return {
            name,
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            delayed: delayed.length,
            paused: paused.length,
            workers: workers.length,
          };
        } catch (error) {
          this.logger.warn(`Failed to get stats for queue ${name}:`, error);
          return {
            name,
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            paused: 0,
            workers: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return stats
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map(result => result.value);
  }
}
