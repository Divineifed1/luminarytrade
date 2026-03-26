import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '../health-check.service';
import { DatabaseHealthCheck } from '../checks/database.health-check';
import { RedisHealthCheck } from '../checks/redis.health-check';
import { StellarRpcHealthCheck } from '../checks/stellar-rpc.health-check';
import { AiProviderHealthCheck } from '../checks/ai-provider.health-check';
import { BullQueueHealthCheck } from '../checks/bull-queue.health-check';
import { SystemHealthCheck } from '../checks/system-health-check';
import { HealthStatus, HealthCheckType, HealthCheckLevel } from '../interfaces/health-check.interface';

describe('HealthCheckService', () => {
  let service: HealthCheckService;
  let mockDatabaseHealthCheck: jest.Mocked<DatabaseHealthCheck>;
  let mockRedisHealthCheck: jest.Mocked<RedisHealthCheck>;
  let mockStellarRpcHealthCheck: jest.Mocked<StellarRpcHealthCheck>;
  let mockAiProviderHealthCheck: jest.Mocked<AiProviderHealthCheck>;
  let mockBullQueueHealthCheck: jest.Mocked<BullQueueHealthCheck>;
  let mockSystemHealthCheck: jest.Mocked<SystemHealthCheck>;

  const mockHealthCheckResult = {
    name: 'Test Check',
    type: HealthCheckType.DATABASE,
    status: HealthStatus.UP,
    responseTime: 100,
    timestamp: new Date(),
    level: HealthCheckLevel.INFO,
  };

  beforeEach(async () => {
    mockDatabaseHealthCheck = {
      check: jest.fn().mockResolvedValue(mockHealthCheckResult),
    } as any;

    mockRedisHealthCheck = {
      check: jest.fn().mockResolvedValue({
        ...mockHealthCheckResult,
        name: 'Redis',
        type: HealthCheckType.REDIS,
      }),
    } as any;

    mockStellarRpcHealthCheck = {
      check: jest.fn().mockResolvedValue({
        ...mockHealthCheckResult,
        name: 'Stellar RPC',
        type: HealthCheckType.STELLAR_RPC,
      }),
    } as any;

    mockAiProviderHealthCheck = {
      check: jest.fn().mockResolvedValue({
        ...mockHealthCheckResult,
        name: 'AI Provider',
        type: HealthCheckType.AI_PROVIDER,
      }),
    } as any;

    mockBullQueueHealthCheck = {
      check: jest.fn().mockResolvedValue({
        ...mockHealthCheckResult,
        name: 'Bull Queues',
        type: HealthCheckType.BULL_QUEUE,
      }),
    } as any;

    mockSystemHealthCheck = {
      checkDiskSpace: jest.fn().mockResolvedValue({
        ...mockHealthCheckResult,
        name: 'Disk Space',
        type: HealthCheckType.DISK_SPACE,
      }),
      checkMemory: jest.fn().mockResolvedValue({
        ...mockHealthCheckResult,
        name: 'Memory',
        type: HealthCheckType.MEMORY,
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCheckService,
        {
          provide: DatabaseHealthCheck,
          useValue: mockDatabaseHealthCheck,
        },
        {
          provide: RedisHealthCheck,
          useValue: mockRedisHealthCheck,
        },
        {
          provide: StellarRpcHealthCheck,
          useValue: mockStellarRpcHealthCheck,
        },
        {
          provide: AiProviderHealthCheck,
          useValue: mockAiProviderHealthCheck,
        },
        {
          provide: BullQueueHealthCheck,
          useValue: mockBullQueueHealthCheck,
        },
        {
          provide: SystemHealthCheck,
          useValue: mockSystemHealthCheck,
        },
      ],
    }).compile();

    service = module.get<HealthCheckService>(HealthCheckService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkLiveness', () => {
    it('should return UP status when service is running', async () => {
      const result = await service.checkLiveness();

      expect(result.status).toBe('UP');
      expect(result.timestamp).toBeDefined();
    });

    it('should return SHUTTING_DOWN status when service is shutting down', async () => {
      await service.onApplicationShutdown();
      const result = await service.checkLiveness();

      expect(result.status).toBe('SHUTTING_DOWN');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('checkReadiness', () => {
    it('should return UP status when all checks pass', async () => {
      const report = await service.checkReadiness();

      expect(report.status).toBe(HealthStatus.UP);
      expect(report.totalChecks).toBeGreaterThan(0);
      expect(report.healthyChecks).toBe(report.totalChecks);
      expect(report.degradedChecks).toBe(0);
      expect(report.failedChecks).toBe(0);
    });

    it('should return DEGRADED status when some checks are degraded', async () => {
      mockSystemHealthCheck.checkDiskSpace.mockResolvedValueOnce({
        ...mockHealthCheckResult,
        name: 'Disk Space',
        type: HealthCheckType.DISK_SPACE,
        status: HealthStatus.DEGRADED,
        level: HealthCheckLevel.WARNING,
      });

      const report = await service.checkReadiness();

      expect(report.status).toBe(HealthStatus.DEGRADED);
      expect(report.degradedChecks).toBeGreaterThan(0);
    });

    it('should return DOWN status when critical checks fail', async () => {
      mockDatabaseHealthCheck.check.mockResolvedValueOnce({
        ...mockHealthCheckResult,
        status: HealthStatus.DOWN,
        level: HealthCheckLevel.CRITICAL,
      });

      const report = await service.checkReadiness();

      expect(report.status).toBe(HealthStatus.DOWN);
      expect(report.failedChecks).toBeGreaterThan(0);
      expect(report.summary.criticalFailures).toContain('PostgreSQL');
    });
  });

  describe('checkDetailed', () => {
    it('should include metrics in detailed report', async () => {
      const report = await service.checkDetailed();

      expect((report as any).metrics).toBeDefined();
      expect((report as any).uptime).toBeDefined();
    });
  });

  describe('checkDependency', () => {
    it('should return health check result for valid dependency', async () => {
      const result = await service.checkDependency('database');

      expect(result).toBeDefined();
      expect(result?.name).toBe('PostgreSQL');
      expect(result?.type).toBe(HealthCheckType.DATABASE);
      expect(mockDatabaseHealthCheck.check).toHaveBeenCalled();
    });

    it('should return null for invalid dependency', async () => {
      const result = await service.checkDependency('invalid');

      expect(result).toBeNull();
    });

    it('should handle health check failures gracefully', async () => {
      mockDatabaseHealthCheck.check.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await service.checkDependency('database');

      expect(result).toBeDefined();
      expect(result?.status).toBe(HealthStatus.DOWN);
      expect(result?.error).toBe('Connection failed');
    });
  });

  describe('getDependencyGraph', () => {
    it('should return dependency graph with nodes and edges', async () => {
      const graph = await service.getDependencyGraph();

      expect(graph.nodes).toBeDefined();
      expect(graph.edges).toBeDefined();
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
    });

    it('should include health status in nodes', async () => {
      const graph = await service.getDependencyGraph();

      const databaseNode = graph.nodes.find((n: any) => n.id === 'PostgreSQL');
      expect(databaseNode).toBeDefined();
      expect(databaseNode.status).toBe(HealthStatus.UP);
    });
  });

  describe('registerCustomHealthCheck', () => {
    it('should register custom health check', () => {
      const customCheck = jest.fn().mockResolvedValue(mockHealthCheckResult);

      service.registerCustomHealthCheck('custom', customCheck);

      const result = service.checkDependency('custom');
      expect(result).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should return health metrics', async () => {
      await service.checkReadiness(); // Generate some metrics
      const metrics = service.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalChecks).toBeGreaterThan(0);
      expect(metrics.successfulChecks).toBeGreaterThan(0);
      expect(metrics.uptime).toBeGreaterThan(0);
    });
  });

  describe('timeout handling', () => {
    it('should handle health check timeouts', async () => {
      mockDatabaseHealthCheck.check.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 15000)) // 15 second delay
      );

      const report = await service.checkReadiness();

      expect(report.failedChecks).toBeGreaterThan(0);
      const failedCheck = report.checks.find(c => c.name === 'PostgreSQL');
      expect(failedCheck?.status).toBe(HealthStatus.DOWN);
      expect(failedCheck?.error).toContain('timeout');
    });
  });

  describe('metrics tracking', () => {
    it('should track response times correctly', async () => {
      const expectedResponseTime = 150;
      mockDatabaseHealthCheck.check.mockResolvedValueOnce({
        ...mockHealthCheckResult,
        responseTime: expectedResponseTime,
      });

      await service.checkDependency('database');
      const metrics = service.getMetrics();

      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(expectedResponseTime);
    });

    it('should track success/failure rates', async () => {
      mockDatabaseHealthCheck.check.mockResolvedValueOnce({
        ...mockHealthCheckResult,
        status: HealthStatus.DOWN,
      });

      await service.checkDependency('database');
      const metrics = service.getMetrics();

      expect(metrics.failedChecks).toBeGreaterThan(0);
      expect(metrics.successfulChecks).toBeGreaterThanOrEqual(0);
    });
  });
});
