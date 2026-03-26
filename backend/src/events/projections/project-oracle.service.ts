import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventStoreService } from '../event-store/event-store.service';
import { Event, EventType, AggregateType } from '../event-store/event.entity';

export interface OracleState {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DEGRADED';
  config: Record<string, any>;
  data: {
    latestData: any;
    lastUpdated: Date;
    source: string;
    version: number;
  };
  performance: {
    totalQueries: number;
    successRate: number;
    averageResponseTime: number;
    errorCount: number;
    lastUpdated: Date;
  };
  health: {
    isHealthy: boolean;
    lastHealthCheck: Date;
    issues: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

@Injectable()
export class ProjectOracleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectOracleService.name);
  private oracleStates: Map<string, OracleState> = new Map();
  private subscriptionId?: string;

  constructor(
    private readonly eventStoreService: EventStoreService,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Oracle Projection Service...');
    
    // Subscribe to oracle-related events
    this.subscriptionId = this.eventStoreService.subscribeToEvents(
      async (event) => this.handleOracleEvent(event),
      {
        aggregateType: AggregateType.ORACLE,
      }
    );

    // Rebuild existing oracle states
    await this.rebuildOracleStates();
    
    this.logger.log('Oracle Projection Service initialized');
  }

  /**
   * Handle oracle-related events
   */
  private async handleOracleEvent(event: Event): Promise<void> {
    try {
      switch (event.eventType) {
        case EventType.ORACLE_DATA_UPDATED:
          await this.handleOracleDataUpdated(event);
          break;
      }
    } catch (error) {
      this.logger.error(`Error handling oracle event ${event.eventType}:`, error);
    }
  }

  /**
   * Handle oracle data update
   */
  private async handleOracleDataUpdated(event: Event): Promise<void> {
    const existingState = this.oracleStates.get(event.aggregateId);
    const updateData = event.data as any;

    if (!existingState) {
      // Oracle doesn't exist, create it
      const oracleState: OracleState = {
        id: event.aggregateId,
        name: updateData.name || event.aggregateId,
        status: 'ACTIVE',
        config: updateData.config || {},
        data: {
          latestData: updateData.data || {},
          lastUpdated: event.timestamp,
          source: updateData.source || 'unknown',
          version: updateData.version || 1,
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
        version: event.version,
      };

      this.oracleStates.set(event.aggregateId, oracleState);
      this.logger.debug(`Oracle projection created: ${event.aggregateId}`);
      return;
    }

    const updatedState: OracleState = {
      ...existingState,
      ...updateData,
      updatedAt: event.timestamp,
      version: event.version,
    };

    // Update data section
    if (updateData.data !== undefined) {
      updatedState.data = {
        ...existingState.data,
        latestData: updateData.data,
        lastUpdated: event.timestamp,
        source: updateData.source || existingState.data.source,
        version: (existingState.data.version || 1) + 1,
      };
    }

    // Update config if provided
    if (updateData.config !== undefined) {
      updatedState.config = {
        ...existingState.config,
        ...updateData.config,
      };
    }

    // Update performance metrics if provided
    if (updateData.performance !== undefined) {
      updatedState.performance = {
        ...existingState.performance,
        ...updateData.performance,
        lastUpdated: event.timestamp,
      };
    }

    // Update health status if provided
    if (updateData.health !== undefined) {
      updatedState.health = {
        ...existingState.health,
        ...updateData.health,
        lastHealthCheck: event.timestamp,
      };
    }

    // Update status based on health
    if (updatedState.health) {
      updatedState.status = updatedState.health.isHealthy ? 'ACTIVE' : 'DEGRADED';
    }

    this.oracleStates.set(event.aggregateId, updatedState);
    this.logger.debug(`Oracle projection updated: ${event.aggregateId}`);
  }

  /**
   * Rebuild all oracle states from events
   */
  private async rebuildOracleStates(): Promise<void> {
    this.logger.log('Rebuilding oracle states from events...');
    
    // Get all oracle events
    const oracleEvents = await this.eventRepository.find({
      where: { aggregateType: AggregateType.ORACLE },
      order: { aggregateId: 'ASC', version: 'ASC' },
    });

    // Group events by oracle ID
    const eventsByOracle = new Map<string, Event[]>();
    for (const event of oracleEvents) {
      if (!eventsByOracle.has(event.aggregateId)) {
        eventsByOracle.set(event.aggregateId, []);
      }
      eventsByOracle.get(event.aggregateId)!.push(event);
    }

    // Process events for each oracle
    for (const [oracleId, events] of eventsByOracle) {
      let oracleState: OracleState | null = null;
      
      for (const event of events) {
        switch (event.eventType) {
          case EventType.ORACLE_DATA_UPDATED:
            if (!oracleState) {
              const updateData = event.data as any;
              oracleState = {
                id: event.aggregateId,
                name: updateData.name || event.aggregateId,
                status: 'ACTIVE',
                config: updateData.config || {},
                data: {
                  latestData: updateData.data || {},
                  lastUpdated: event.timestamp,
                  source: updateData.source || 'unknown',
                  version: updateData.version || 1,
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
                version: event.version,
              };
            } else {
              const updateData = event.data as any;
              oracleState = {
                ...oracleState,
                ...updateData,
                updatedAt: event.timestamp,
                version: event.version,
              };

              // Update data section
              if (updateData.data !== undefined) {
                oracleState.data = {
                  ...oracleState.data,
                  latestData: updateData.data,
                  lastUpdated: event.timestamp,
                  source: updateData.source || oracleState.data.source,
                  version: (oracleState.data.version || 1) + 1,
                };
              }

              // Update config if provided
              if (updateData.config !== undefined) {
                oracleState.config = {
                  ...oracleState.config,
                  ...updateData.config,
                };
              }

              // Update performance metrics if provided
              if (updateData.performance !== undefined) {
                oracleState.performance = {
                  ...oracleState.performance,
                  ...updateData.performance,
                  lastUpdated: event.timestamp,
                };
              }

              // Update health status if provided
              if (updateData.health !== undefined) {
                oracleState.health = {
                  ...oracleState.health,
                  ...updateData.health,
                  lastHealthCheck: event.timestamp,
                };
              }

              // Update status based on health
              if (oracleState.health) {
                oracleState.status = oracleState.health.isHealthy ? 'ACTIVE' : 'DEGRADED';
              }
            }
            break;
        }
      }
      
      if (oracleState) {
        this.oracleStates.set(oracleId, oracleState);
      }
    }

    this.logger.log(`Rebuilt ${this.oracleStates.size} oracle states`);
  }

  /**
   * Get oracle state by ID
   */
  getOracleState(oracleId: string): OracleState | null {
    return this.oracleStates.get(oracleId) || null;
  }

  /**
   * Get all oracle states
   */
  getAllOracleStates(): OracleState[] {
    return Array.from(this.oracleStates.values());
  }

  /**
   * Get oracle states by status
   */
  getOracleStatesByStatus(status: OracleState['status']): OracleState[] {
    return Array.from(this.oracleStates.values()).filter(state => state.status === status);
  }

  /**
   * Get healthy oracles
   */
  getHealthyOracles(): OracleState[] {
    return Array.from(this.oracleStates.values()).filter(state => 
      state.status === 'ACTIVE' && state.health?.isHealthy
    );
  }

  /**
   * Get degraded oracles
   */
  getDegradedOracles(): OracleState[] {
    return Array.from(this.oracleStates.values()).filter(state => 
      state.status === 'DEGRADED' || !state.health?.isHealthy
    );
  }

  /**
   * Get oracle performance metrics
   */
  getOraclePerformanceMetrics(oracleId: string): OracleState['performance'] | null {
    const state = this.oracleStates.get(oracleId);
    return state?.performance || null;
  }

  /**
   * Update oracle performance metrics
   */
  updateOraclePerformance(
    oracleId: string, 
    metrics: Partial<OracleState['performance']>
  ): void {
    const state = this.oracleStates.get(oracleId);
    if (state) {
      state.performance = {
        ...state.performance,
        ...metrics,
        lastUpdated: new Date(),
      };
      
      this.oracleStates.set(oracleId, state);
    }
  }

  /**
   * Update oracle health status
   */
  updateOracleHealth(
    oracleId: string,
    health: {
      isHealthy: boolean;
      issues?: string[];
    }
  ): void {
    const state = this.oracleStates.get(oracleId);
    if (state) {
      state.health = {
        isHealthy: health.isHealthy,
        lastHealthCheck: new Date(),
        issues: health.issues || [],
      };
      
      state.status = health.isHealthy ? 'ACTIVE' : 'DEGRADED';
      state.updatedAt = new Date();
      
      this.oracleStates.set(oracleId, state);
    }
  }

  /**
   * Get oracle data
   */
  getOracleData(oracleId: string): any {
    const state = this.oracleStates.get(oracleId);
    return state?.data?.latestData || null;
  }

  async onModuleDestroy() {
    if (this.subscriptionId) {
      this.eventStoreService.unsubscribe(this.subscriptionId);
    }
  }
}
