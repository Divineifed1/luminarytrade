import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventStoreService, EventSubscription } from '../event-store/event-store.service';
import { Event, EventType, AggregateType } from '../event-store/event.entity';

export interface AgentState {
  id: string;
  name: string;
  type: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DELETED';
  config: Record<string, any>;
  performance: {
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    lastUpdated: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

@Injectable()
export class ProjectAgentService implements OnModuleInit {
  private readonly logger = new Logger(ProjectAgentService.name);
  private agentStates: Map<string, AgentState> = new Map();
  private subscriptionId?: string;

  constructor(
    private readonly eventStoreService: EventStoreService,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Agent Projection Service...');
    
    // Subscribe to agent-related events
    this.subscriptionId = this.eventStoreService.subscribeToEvents(
      async (event) => this.handleAgentEvent(event),
      {
        aggregateType: AggregateType.AGENT,
      }
    );

    // Rebuild existing agent states
    await this.rebuildAgentStates();
    
    this.logger.log('Agent Projection Service initialized');
  }

  /**
   * Handle agent-related events
   */
  private async handleAgentEvent(event: Event): Promise<void> {
    try {
      switch (event.eventType) {
        case EventType.AGENT_CREATED:
          await this.handleAgentCreated(event);
          break;
        case EventType.AGENT_UPDATED:
          await this.handleAgentUpdated(event);
          break;
        case EventType.AGENT_DELETED:
          await this.handleAgentDeleted(event);
          break;
      }
    } catch (error) {
      this.logger.error(`Error handling agent event ${event.eventType}:`, error);
    }
  }

  /**
   * Handle agent creation
   */
  private async handleAgentCreated(event: Event): Promise<void> {
    const agentData = event.data as any;
    const agentState: AgentState = {
      id: event.aggregateId,
      name: agentData.name,
      type: agentData.type,
      status: 'ACTIVE',
      config: agentData.config || {},
      performance: {
        totalRequests: 0,
        successRate: 100,
        averageResponseTime: 0,
        lastUpdated: new Date(),
      },
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      version: event.version,
    };

    this.agentStates.set(event.aggregateId, agentState);
    this.logger.debug(`Agent projection created: ${event.aggregateId}`);
  }

  /**
   * Handle agent update
   */
  private async handleAgentUpdated(event: Event): Promise<void> {
    const existingState = this.agentStates.get(event.aggregateId);
    if (!existingState) {
      // Agent doesn't exist, create it
      await this.handleAgentCreated(event);
      return;
    }

    const updateData = event.data as any;
    const updatedState: AgentState = {
      ...existingState,
      ...updateData,
      updatedAt: event.timestamp,
      version: event.version,
    };

    // Update performance metrics if provided
    if (updateData.performance) {
      updatedState.performance = {
        ...existingState.performance,
        ...updateData.performance,
        lastUpdated: event.timestamp,
      };
    }

    this.agentStates.set(event.aggregateId, updatedState);
    this.logger.debug(`Agent projection updated: ${event.aggregateId}`);
  }

  /**
   * Handle agent deletion
   */
  private async handleAgentDeleted(event: Event): Promise<void> {
    const existingState = this.agentStates.get(event.aggregateId);
    if (!existingState) {
      return; // Agent already deleted or doesn't exist
    }

    const updatedState: AgentState = {
      ...existingState,
      status: 'DELETED',
      updatedAt: event.timestamp,
      version: event.version,
    };

    this.agentStates.set(event.aggregateId, updatedState);
    this.logger.debug(`Agent projection deleted: ${event.aggregateId}`);
  }

  /**
   * Rebuild all agent states from events
   */
  private async rebuildAgentStates(): Promise<void> {
    this.logger.log('Rebuilding agent states from events...');
    
    // Get all agent events
    const agentEvents = await this.eventRepository.find({
      where: { aggregateType: AggregateType.AGENT },
      order: { aggregateId: 'ASC', version: 'ASC' },
    });

    // Group events by agent ID
    const eventsByAgent = new Map<string, Event[]>();
    for (const event of agentEvents) {
      if (!eventsByAgent.has(event.aggregateId)) {
        eventsByAgent.set(event.aggregateId, []);
      }
      eventsByAgent.get(event.aggregateId)!.push(event);
    }

    // Process events for each agent
    for (const [agentId, events] of eventsByAgent) {
      let agentState: AgentState | null = null;
      
      for (const event of events) {
        switch (event.eventType) {
          case EventType.AGENT_CREATED:
            if (!agentState) {
              const agentData = event.data as any;
              agentState = {
                id: event.aggregateId,
                name: agentData.name,
                type: agentData.type,
                status: 'ACTIVE',
                config: agentData.config || {},
                performance: {
                  totalRequests: 0,
                  successRate: 100,
                  averageResponseTime: 0,
                  lastUpdated: new Date(),
                },
                createdAt: event.timestamp,
                updatedAt: event.timestamp,
                version: event.version,
              };
            }
            break;
          case EventType.AGENT_UPDATED:
            if (agentState) {
              const updateData = event.data as any;
              agentState = {
                ...agentState,
                ...updateData,
                updatedAt: event.timestamp,
                version: event.version,
              };
              
              if (updateData.performance) {
                agentState.performance = {
                  ...agentState.performance,
                  ...updateData.performance,
                  lastUpdated: event.timestamp,
                };
              }
            }
            break;
          case EventType.AGENT_DELETED:
            if (agentState) {
              agentState = {
                ...agentState,
                status: 'DELETED',
                updatedAt: event.timestamp,
                version: event.version,
              };
            }
            break;
        }
      }
      
      if (agentState) {
        this.agentStates.set(agentId, agentState);
      }
    }

    this.logger.log(`Rebuilt ${this.agentStates.size} agent states`);
  }

  /**
   * Get agent state by ID
   */
  getAgentState(agentId: string): AgentState | null {
    return this.agentStates.get(agentId) || null;
  }

  /**
   * Get all agent states
   */
  getAllAgentStates(): AgentState[] {
    return Array.from(this.agentStates.values());
  }

  /**
   * Get agent states by status
   */
  getAgentStatesByStatus(status: AgentState['status']): AgentState[] {
    return Array.from(this.agentStates.values()).filter(state => state.status === status);
  }

  /**
   * Get agent states by type
   */
  getAgentStatesByType(type: string): AgentState[] {
    return Array.from(this.agentStates.values()).filter(state => state.type === type);
  }

  /**
   * Get agent performance metrics
   */
  getAgentPerformanceMetrics(agentId: string): AgentState['performance'] | null {
    const state = this.agentStates.get(agentId);
    return state?.performance || null;
  }

  /**
   * Update agent performance metrics
   */
  updateAgentPerformance(
    agentId: string, 
    metrics: Partial<AgentState['performance']>
  ): void {
    const state = this.agentStates.get(agentId);
    if (state) {
      state.performance = {
        ...state.performance,
        ...metrics,
        lastUpdated: new Date(),
      };
      
      this.agentStates.set(agentId, state);
    }
  }

  async onModuleDestroy() {
    if (this.subscriptionId) {
      this.eventStoreService.unsubscribe(this.subscriptionId);
    }
  }
}
