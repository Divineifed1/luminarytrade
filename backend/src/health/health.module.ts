import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';

// Services
import { HealthCheckService } from './health-check.service';

// Health Checks
import { DatabaseHealthCheck } from './checks/database.health-check';
import { RedisHealthCheck } from './checks/redis.health-check';
import { StellarRpcHealthCheck } from './checks/stellar-rpc.health-check';
import { AiProviderHealthCheck } from './checks/ai-provider.health-check';
import { BullQueueHealthCheck } from './checks/bull-queue.health-check';
import { SystemHealthCheck } from './checks/system-health-check';

// Controllers
import { HealthCheckController } from './health-check.controller';

@Module({
  imports: [
    TypeOrmModule,
    BullModule,
    ConfigModule,
  ],
  controllers: [
    HealthCheckController,
  ],
  providers: [
    // Main service
    HealthCheckService,
    
    // Health check services
    DatabaseHealthCheck,
    RedisHealthCheck,
    StellarRpcHealthCheck,
    AiProviderHealthCheck,
    BullQueueHealthCheck,
    SystemHealthCheck,
  ],
  exports: [
    HealthCheckService,
    DatabaseHealthCheck,
    RedisHealthCheck,
    StellarRpcHealthCheck,
    AiProviderHealthCheck,
    BullQueueHealthCheck,
    SystemHealthCheck,
  ],
})
export class HealthModule {}
