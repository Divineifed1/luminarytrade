import { Test, TestingModule } from '@nestjs/testing';
import { ProjectAgentService, AgentState } from '../projections/project-agent.service';
import { EventStoreService } from '../../event-store/event-store.service';
import { Event, EventType, AggregateType } from '../../event-store/event.entity';

describe('ProjectAgentService', () => {
  let service: ProjectAgentService;
  let mockEventStoreService: jest.Mocked<EventStoreService>;

  const mockAgentState: AgentState = {
    id: 'test-agent-id',
    name: 'Test Agent',
    type: 'test-type',
    status: 'ACTIVE',
    config: { setting: 'value' },
    performance: {
      totalRequests: 100,
      successRate: 95.5,
      averageResponseTime: 150,
      lastUpdated: new Date(),
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
        ProjectAgentService,
        {
          provide: EventStoreService,
          useValue: mockEventStoreService,
        },
      ],
    }).compile();

    service = module.get<ProjectAgentService>(ProjectAgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleAgentCreated', () => {
    it('should create new agent state', async () => {
      const event: Event = {
        id: 'event-id',
        aggregateId: 'test-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_CREATED,
        data: { name: 'Test Agent', type: 'test-type' },
        metadata: { userId: 'test-user' },
        timestamp: new Date(),
        version: 1,
      } as Event;

      await service.handleAgentEvent(event);

      const agentState = service.getAgentState('test-agent');
      expect(agentState).toEqual({
        id: 'test-agent',
        name: 'Test Agent',
        type: 'test-type',
        status: 'ACTIVE',
        config: {},
        performance: {
          totalRequests: 0,
          successRate: 100,
          averageResponseTime: 0,
          lastUpdated: event.timestamp,
        },
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        version: 1,
      });
    });
  });

  describe('handleAgentUpdated', () => {
    it('should update existing agent state', async () => {
      // First create an agent
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_CREATED,
        data: { name: 'Test Agent', type: 'test-type' },
        timestamp: new Date(),
        version: 1,
      } as Event;

      await service.handleAgentEvent(createEvent);

      // Then update it
      const updateEvent: Event = {
        id: 'update-event',
        aggregateId: 'test-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_UPDATED,
        data: { 
          status: 'INACTIVE',
          performance: {
            totalRequests: 200,
            successRate: 98.0,
          }
        },
        timestamp: new Date(),
        version: 2,
      } as Event;

      await service.handleAgentEvent(updateEvent);

      const agentState = service.getAgentState('test-agent');
      expect(agentState).toEqual({
        id: 'test-agent',
        name: 'Test Agent',
        type: 'test-type',
        status: 'INACTIVE',
        config: {},
        performance: {
          totalRequests: 200,
          successRate: 98.0,
          averageResponseTime: 0,
          lastUpdated: updateEvent.timestamp,
        },
        createdAt: createEvent.timestamp,
        updatedAt: updateEvent.timestamp,
        version: 2,
      });
    });

    it('should handle agent update for non-existent agent', async () => {
      const updateEvent: Event = {
        id: 'update-event',
        aggregateId: 'non-existent-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_UPDATED,
        data: { status: 'INACTIVE' },
        timestamp: new Date(),
        version: 1,
      } as Event;

      await service.handleAgentEvent(updateEvent);

      // Should create the agent first
      const agentState = service.getAgentState('non-existent-agent');
      expect(agentState).toEqual({
        id: 'non-existent-agent',
        status: 'INACTIVE',
        name: 'INACTIVE', // Should use data.name which is 'INACTIVE'
        type: 'INACTIVE',
        config: {},
        performance: {
          totalRequests: 0,
          successRate: 100,
          averageResponseTime: 0,
          lastUpdated: updateEvent.timestamp,
        },
        createdAt: updateEvent.timestamp,
        updatedAt: updateEvent.timestamp,
        version: 1,
      });
    });
  });

  describe('handleAgentDeleted', () => {
    it('should mark agent as deleted', async () => {
      // First create an agent
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_CREATED,
        data: { name: 'Test Agent', type: 'test-type' },
        timestamp: new Date(),
        version: 1,
      } as Event;

      await service.handleAgentEvent(createEvent);

      // Then delete it
      const deleteEvent: Event = {
        id: 'delete-event',
        aggregateId: 'test-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_DELETED,
        data: { id: 'test-agent' },
        timestamp: new Date(),
        version: 2,
      } as Event;

      await service.handleAgentEvent(deleteEvent);

      const agentState = service.getAgentState('test-agent');
      expect(agentState).toEqual({
        id: 'test-agent',
        name: 'Test Agent',
        type: 'test-type',
        status: 'DELETED',
        config: {},
        performance: {
          totalRequests: 0,
          successRate: 100,
          averageResponseTime: 0,
          lastUpdated: deleteEvent.timestamp,
        },
        createdAt: createEvent.timestamp,
        updatedAt: deleteEvent.timestamp,
        version: 2,
      });
    });

    it('should handle deletion of non-existent agent', async () => {
      const deleteEvent: Event = {
        id: 'delete-event',
        aggregateId: 'non-existent-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_DELETED,
        data: { id: 'non-existent-agent' },
        timestamp: new Date(),
        version: 1,
      } as Event;

      await service.handleAgentEvent(deleteEvent);

      const agentState = service.getAgentState('non-existent-agent');
      expect(agentState).toBeNull();
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      // Setup initial agent state
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_CREATED,
        data: { name: 'Test Agent', type: 'test-type', status: 'ACTIVE' },
        timestamp: new Date(),
        version: 1,
      } as Event;

      service.handleAgentEvent(createEvent);
    });

    it('should get agent state by ID', () => {
      const agentState = service.getAgentState('test-agent');
      expect(agentState).toEqual(mockAgentState);
    });

    it('should return null for non-existent agent', () => {
      const agentState = service.getAgentState('non-existent');
      expect(agentState).toBeNull();
    });

    it('should get all agent states', () => {
      const allStates = service.getAllAgentStates();
      expect(allStates).toHaveLength(1);
      expect(allStates[0]).toEqual(mockAgentState);
    });

    it('should get agent states by status', () => {
      const activeStates = service.getAgentStatesByStatus('ACTIVE');
      expect(activeStates).toHaveLength(1);
      expect(activeStates[0].status).toBe('ACTIVE');
    });

    it('should get agent states by type', () => {
      const testTypeStates = service.getAgentStatesByType('test-type');
      expect(testTypeStates).toHaveLength(1);
      expect(testTypeStates[0].type).toBe('test-type');
    });
  });

  describe('performance metrics', () => {
    beforeEach(() => {
      const createEvent: Event = {
        id: 'create-event',
        aggregateId: 'test-agent',
        aggregateType: AggregateType.AGENT,
        eventType: EventType.AGENT_CREATED,
        data: { name: 'Test Agent', type: 'test-type' },
        timestamp: new Date(),
        version: 1,
      } as Event;

      service.handleAgentEvent(createEvent);
    });

    it('should get performance metrics', () => {
      const metrics = service.getAgentPerformanceMetrics('test-agent');
      expect(metrics).toEqual(mockAgentState.performance);
    });

    it('should return null for non-existent agent', () => {
      const metrics = service.getAgentPerformanceMetrics('non-existent');
      expect(metrics).toBeNull();
    });

    it('should update performance metrics', () => {
      const newMetrics = {
        totalRequests: 300,
        successRate: 99.0,
      };

      service.updateAgentPerformance('test-agent', newMetrics);

      const updatedState = service.getAgentState('test-agent');
      expect(updatedState?.performance).toEqual({
        ...mockAgentState.performance,
        ...newMetrics,
        lastUpdated: expect.any(Date),
      });
    });
  });

  describe('subscription management', () => {
    it('should subscribe to agent events on init', () => {
      expect(mockEventStoreService.subscribeToEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { aggregateType: AggregateType.AGENT }
      );
      expect(mockEventStoreService.subscribeToEvents).toHaveReturnedWith('test-subscription-id');
    });

    it('should unsubscribe on destroy', () => {
      service.onModuleDestroy();

      expect(mockEventStoreService.unsubscribe).toHaveBeenCalledWith('test-subscription-id');
    });
  });
});
