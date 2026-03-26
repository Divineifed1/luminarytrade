import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckController } from '../health-check.controller';
import { HealthCheckService } from '../health-check.service';
import { HealthStatus, HealthCheckType } from '../interfaces/health-check.interface';

describe('HealthCheckController', () => {
  let controller: HealthCheckController;
  let mockHealthCheckService: jest.Mocked<HealthCheckService>;

  const mockHealthReport = {
    status: HealthStatus.UP,
    timestamp: new Date(),
    totalChecks: 8,
    healthyChecks: 8,
    degradedChecks: 0,
    failedChecks: 0,
    checks: [],
    summary: {
      overallResponseTime: 150,
      criticalFailures: [],
      warnings: [],
    },
  };

  const mockMetrics = {
    uptime: 3600,
    totalChecks: 100,
    successfulChecks: 95,
    failedChecks: 5,
    averageResponseTime: 120,
    last24Hours: [],
    checkMetrics: new Map(),
  };

  beforeEach(async () => {
    mockHealthCheckService = {
      checkLiveness: jest.fn().mockResolvedValue({
        status: 'UP',
        timestamp: new Date().toISOString(),
      }),
      checkReadiness: jest.fn().mockResolvedValue(mockHealthReport),
      checkDetailed: jest.fn().mockResolvedValue(mockHealthReport),
      checkDependency: jest.fn(),
      getDependencyGraph: jest.fn().mockResolvedValue({
        nodes: [],
        edges: [],
      }),
      getMetrics: jest.fn().mockReturnValue(mockMetrics),
      registerCustomHealthCheck: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthCheckController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
      ],
    }).compile();

    controller = module.get<HealthCheckController>(HealthCheckController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('liveness', () => {
    it('should return 200 for healthy service', async () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.liveness(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'UP',
        timestamp: expect.any(String),
      });
    });

    it('should return 503 for shutting down service', async () => {
      mockHealthCheckService.checkLiveness.mockResolvedValueOnce({
        status: 'SHUTTING_DOWN',
        timestamp: new Date().toISOString(),
      });

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.liveness(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'SHUTTING_DOWN',
        timestamp: expect.any(String),
      });
    });
  });

  describe('readiness', () => {
    it('should return 200 for ready service', async () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.readiness(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: HealthStatus.UP,
        timestamp: expect.any(String),
        summary: {
          total: 8,
          healthy: 8,
          degraded: 0,
          failed: 0,
        },
        criticalFailures: [],
        warnings: [],
        responseTime: 150,
      });
    });

    it('should return 503 for unhealthy service', async () => {
      const unhealthyReport = {
        ...mockHealthReport,
        status: HealthStatus.DOWN,
        failedChecks: 2,
        summary: {
          ...mockHealthReport.summary,
          criticalFailures: ['Database', 'Redis'],
        },
      };

      mockHealthCheckService.checkReadiness.mockResolvedValueOnce(unhealthyReport);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.readiness(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: HealthStatus.DOWN,
        timestamp: expect.any(String),
        summary: {
          total: 8,
          healthy: 6,
          degraded: 0,
          failed: 2,
        },
        criticalFailures: ['Database', 'Redis'],
        warnings: [],
        responseTime: 150,
      });
    });
  });

  describe('detailed', () => {
    it('should return detailed health information', async () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.detailed(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: HealthStatus.UP,
        timestamp: expect.any(String),
        uptime: 3600,
        summary: {
          total: 8,
          healthy: 8,
          degraded: 0,
          failed: 0,
          overallResponseTime: 150,
          criticalFailures: [],
          warnings: [],
        },
        checks: [],
        metrics: {
          totalChecks: 100,
          successfulChecks: 95,
          failedChecks: 5,
          averageResponseTime: 120,
          last24Hours: {
            total: 0,
            status: 'NO_DATA',
          },
        },
      });
    });
  });

  describe('dependencies', () => {
    it('should return dependency graph', async () => {
      const mockGraph = {
        nodes: [
          {
            id: 'database',
            label: 'PostgreSQL',
            type: HealthCheckType.DATABASE,
            status: HealthStatus.UP,
            responseTime: 100,
            lastChecked: new Date(),
          },
        ],
        edges: [
          { from: 'database', to: 'AI Provider' },
        ],
      };

      mockHealthCheckService.getDependencyGraph.mockResolvedValueOnce(mockGraph);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.dependencies(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        graph: {
          nodes: mockGraph.nodes,
          edges: mockGraph.edges,
        },
        summary: {
          totalNodes: 1,
          totalEdges: 1,
          healthyNodes: 1,
          degradedNodes: 0,
          failedNodes: 0,
        },
      });
    });
  });

  describe('checkDependency', () => {
    it('should return dependency health for valid dependency', async () => {
      const mockDependency = {
        name: 'PostgreSQL',
        type: HealthCheckType.DATABASE,
        status: HealthStatus.UP,
        responseTime: 100,
        timestamp: new Date(),
        level: 'INFO' as any,
      };

      mockHealthCheckService.checkDependency.mockResolvedValueOnce(mockDependency);

      const mockRes = {
        req: { params: { dependency: 'database' } },
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.checkDependency(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockDependency);
    });

    it('should return 404 for invalid dependency', async () => {
      mockHealthCheckService.checkDependency.mockResolvedValueOnce(null);

      const mockRes = {
        req: { params: { dependency: 'invalid' } },
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.checkDependency(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Dependency 'invalid' not found",
      });
    });

    it('should return 400 for missing dependency name', async () => {
      const mockRes = {
        req: { params: {} },
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.checkDependency(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Dependency name is required',
      });
    });
  });

  describe('metrics', () => {
    it('should return health metrics', async () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.metrics(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        uptime: 3600,
        summary: {
          totalChecks: 100,
          successfulChecks: 95,
          failedChecks: 5,
          averageResponseTime: 120,
          successRate: '95.00%',
        },
        last24Hours: {
          total: 0,
          status: 'NO_DATA',
          history: [],
        },
        byType: [],
      });
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockHealthCheckService.checkLiveness.mockRejectedValueOnce(new Error('Service error'));

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await controller.liveness(mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ERROR',
        timestamp: expect.any(String),
        error: 'Service error',
      });
    });
  });
});
