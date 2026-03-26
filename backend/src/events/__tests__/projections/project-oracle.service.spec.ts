import { Test, TestingModule } from '@nestjs/testing';
import { ProjectOracleService, OracleState } from '../projections/project-oracle.service';
import { EventStoreService } from '../../event-store/event-store.service';
import { Event, EventType, AggregateType } from '../../event-store/event.entity';

describe('ProjectOracleService', () => {
  let service: ProjectOracleService;
  let mockEventStoreService: jest.Mocked<EventStoreService>;

  const mockOracleState: OracleState = {
    id: 'test-oracle-id',
    name: 'Test Oracle',
    status: 'ACTIVE',
    config: { setting: 'value' },
    data: {
      latestData: { price: 100, timestamp: new Date() },
      lastUpdated: new Date(),
      source: 'test-source',
      version: 1,
    },
    performance: {
      totalQueries: 500,
      successRate: 99.5,
      averageResponseTime: 120,
      errorCount: 5,
      lastUpdated: new Date(),
    },
    health: {
      isHealthy: true,
      lastHealthCheck: new Date(),
      issues: [],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 5,
  };

  beforeEach(async () => {
    mockEventStoreService = {
      subscribeToEvents: jest.fn().mockReturnValue('test-subscription-id'),
      unsubscribe: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectOracleService,
        {
          provide: EventStoreService,
          useValue: mockEventStoreService,
        },
      ],
    }).compile();

    service = module.get<ProjectOracleService>(ProjectOracleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleOracleDataUpdated', () => {
    it('should create new oracle state', async () => {
      const event: Event = {
        id: 'event-id',
        aggregateId: 'test-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: {
          name: 'Test Oracle',
          data: { price: 100 },
          config: { setting: 'value' },
        },
        metadata: { userId: 'test-user' },
        timestamp: new Date(),
        version: 1,
      } as Event;

      await service.handleOracleEvent(event);

      const oracleState = service.getOracleState('test-oracle');
      expect(oracleState).toEqual({
        id: 'test-oracle',
        name: 'Test Oracle',
        status: 'ACTIVE',
        config: { setting: 'value' },
        data: {
          latestData: { price: 100 },
          lastUpdated: event.timestamp,
          source: 'test-source',
          version: 1,
        },
        performance: {
          totalQueries: 0,
          successRate: 100,
          averageResponseTime: 0,
          errorCount: 0,
          lastUpdated: event.timestamp,
        },
        health: {
          isHealthy: true,
          lastHealthCheck: event.timestamp,
          issues: [],
        },
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        version: 1,
      });
    });

    it('should update existing oracle state', async () => {
      // First create an oracle
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: {
          name: 'Test Oracle',
          data: { price: 100 },
        },
        timestamp: new Date(),
        version: 1,
      } as Event;

      await service.handleOracleEvent(createEvent);

      // Then update it
      const updateEvent: Event = {
        id: 'update-event',
        aggregateId: 'test-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: {
          data: { price: 200 },
          performance: {
            totalQueries: 100,
            successRate: 98.0,
          },
          health: {
            isHealthy: false,
            issues: ['High latency'],
          },
        },
        timestamp: new Date(),
        version: 2,
      } as Event;

      await service.handleOracleEvent(updateEvent);

      const oracleState = service.getOracleState('test-oracle');
      expect(oracleState).toEqual({
        id: 'test-oracle',
        name: 'Test Oracle',
        status: 'DEGRADED', // Updated due to unhealthy status
        config: { setting: 'value' },
        data: {
          latestData: { price: 200 },
          lastUpdated: updateEvent.timestamp,
          source: 'test-source',
          version: 2, // Incremented
        },
        performance: {
          totalQueries: 100,
          successRate: 98.0,
          averageResponseTime: 0,
          errorCount: 0,
          lastUpdated: updateEvent.timestamp,
        },
        health: {
          isHealthy: false,
          lastHealthCheck: updateEvent.timestamp,
          issues: ['High latency'],
        },
        createdAt: expect.any(Date),
        updatedAt: updateEvent.timestamp,
        version: 2,
      });
    });

    it('should handle oracle update for non-existent oracle', async () => {
      const updateEvent: Event = {
        id: 'update-event',
        aggregateId: 'non-existent-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: {
          name: 'New Oracle',
          data: { price: 150 },
        },
        timestamp: new Date(),
        version: 1,
      } as Event;

      await service.handleOracleEvent(updateEvent);

      const oracleState = service.getOracleState('non-existent-oracle');
      expect(oracleState).toEqual({
        id: 'non-existent-oracle',
        name: 'New Oracle',
        status: 'ACTIVE',
        config: {},
        data: {
          latestData: { price: 150 },
          lastUpdated: updateEvent.timestamp,
          source: 'unknown',
          version: 1,
        },
        performance: {
          totalQueries: 0,
          successRate: 100,
          averageResponseTime: 0,
          errorCount: 0,
          lastUpdated: updateEvent.timestamp,
        },
        health: {
          isHealthy: true,
          lastHealthCheck: updateEvent.timestamp,
          issues: [],
        },
        createdAt: updateEvent.timestamp,
        updatedAt: updateEvent.timestamp,
        version: 1,
      });
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      // Setup initial oracle state
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: { name: 'Test Oracle', data: { price: 100 } },
        timestamp: new Date(),
        version: 1,
      } as Event;

      service.handleOracleEvent(createEvent);
    });

    it('should get oracle state by ID', () => {
      const oracleState = service.getOracleState('test-oracle');
      expect(oracleState).toEqual(mockOracleState);
    });

    it('should return null for non-existent oracle', () => {
      const oracleState = service.getOracleState('non-existent-oracle');
      expect(oracleState).toBeNull();
    });

    it('should get all oracle states', () => {
      const allStates = service.getAllOracleStates();
      expect(allStates).toHaveLength(1);
      expect(allStates[0]).toEqual(mockOracleState);
    });

    it('should get oracle states by status', () => {
      const activeStates = service.getOracleStatesByStatus('ACTIVE');
      expect(activeStates).toHaveLength(1);
      expect(activeStates[0].status).toBe('ACTIVE');
    });

    it('should get healthy oracles', () => {
      const healthyOracles = service.getHealthyOracles();
      expect(healthyOracles).toHaveLength(1);
      expect(healthyOracles[0].health?.isHealthy).toBe(true);
    });

    it('should get degraded oracles', () => {
      // Create a degraded oracle
      const degradedEvent: Event = {
        id: 'degraded-event',
        aggregateId: 'test-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: {
          health: {
            isHealthy: false,
            issues: ['Connection issues'],
          },
        },
        timestamp: new Date(),
        version: 2,
      } as Event;

      service.handleOracleEvent(degradedEvent);

      const degradedOracles = service.getDegradedOracles();
      expect(degradedOracles).toHaveLength(1);
      expect(degradedOracles[0].status).toBe('DEGRADED');
    });
  });

  describe('performance metrics', () => {
    beforeEach(() => {
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: { name: 'Test Oracle', data: { price: 100 } },
        timestamp: new Date(),
        version: 1,
      } as Event;

      service.handleOracleEvent(createEvent);
    });

    it('should get oracle performance metrics', () => {
      const metrics = service.getOraclePerformanceMetrics('test-oracle');
      expect(metrics).toEqual(mockOracleState.performance);
    });

    it('should return null for non-existent oracle', () => {
      const metrics = service.getOraclePerformanceMetrics('non-existent-oracle');
      expect(metrics).toBeNull();
    });

    it('should update oracle performance metrics', () => {
      const newMetrics = {
        totalQueries: 600,
        successRate: 99.0,
      };

      service.updateOraclePerformance('test-oracle', newMetrics);

      const updatedState = service.getOracleState('test-oracle');
      expect(updatedState?.performance).toEqual({
        ...mockOracleState.performance,
        ...newMetrics,
        lastUpdated: expect.any(Date),
      });
    });
  });

  describe('health management', () => {
    beforeEach(() => {
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: { name: 'Test Oracle', data: { price: 100 } },
        timestamp: new Date(),
        version: 1,
      } as Event;

      service.handleOracleEvent(createEvent);
    });

    it('should update oracle health status', () => {
      const healthUpdate = {
        isHealthy: false,
        issues: ['High error rate', 'Slow response'],
      };

      service.updateOracleHealth('test-oracle', healthUpdate);

      const updatedState = service.getOracleState('test-oracle');
      expect(updatedState?.status).toBe('DEGRADED');
      expect(updatedState?.health).toEqual({
        isHealthy: false,
        lastHealthCheck: expect.any(Date),
        issues: ['High error rate', 'Slow response'],
      });
    });
  });

  describe('data access', () => {
    beforeEach(() => {
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-oracle',
        aggregateType: AggregateType.ORACLE,
        eventType: EventType.ORACLE_DATA_UPDATED,
        data: { name: 'Test Oracle', data: { price: 100, volume: 1000 } },
        timestamp: new Date(),
        version: 1,
      } as Event;

      service.handleOracleEvent(createEvent);
    });

    it('should get oracle data', () => {
      const oracleData = service.getOracleData('test-oracle');
      expect(oracleData).toEqual({ price: 100, volume: 1000 });
    });

    it('should return null for non-existent oracle', () => {
      const oracleData = service.getOracleData('non-existent-oracle');
      expect(oracleData).toBeNull();
    });
  });

  describe('subscription management', () => {
    it('should subscribe to oracle events on init', () => {
      expect(mockEventStoreService.subscribeToEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { aggregateType: AggregateType.ORACLE }
      );
    });

    it('should unsubscribe on destroy', () => {
      service.onModuleDestroy();

      expect(mockEventStoreService.unsubscribe).toHaveBeenCalledWith('test-subscription-id');
    });
  });
});
