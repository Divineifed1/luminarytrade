import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, MoreThan } from 'typeorm';
import { 
  Event, 
  EventType, 
  AggregateType, 
  EventMetadata 
} from './event.entity';
import { Snapshot } from './snapshot.entity';
import { EventEmitter } from 'events';

export interface EventSubscription {
  id: string;
  eventType?: EventType;
  aggregateType?: AggregateType;
  callback: (event: Event) => void | Promise<void>;
  active: boolean;
}

export interface EventQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'ASC' | 'DESC';
  includeMetadata?: boolean;
}

@Injectable()
export class EventStoreService extends EventEmitter implements OnModuleInit {
  private readonly logger = new Logger(EventStoreService.name);
  private subscriptions: Map<string, EventSubscription> = new Map();
  private snapshotInterval = 10; // Create snapshot every 10 events
  private readonly maxHistoryDays = 30; // Keep events for 30 days

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Snapshot)
    private readonly snapshotRepository: Repository<Snapshot>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async onModuleInit() {
    this.logger.log('Initializing Event Store Service...');
    await this.cleanupOldEvents();
    this.logger.log('Event Store Service initialized');
  }

  /**
   * Append a new event to the event store
   */
  async appendEvent(event: Omit<Event, 'id' | 'timestamp' | 'version'>): Promise<Event> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get current version for this aggregate
      const lastEvent = await queryRunner.manager.findOne(Event, {
        where: { aggregateId: event.aggregateId },
        order: { version: 'DESC' },
      });

      const version = (lastEvent?.version || 0) + 1;

      // Create the event
      const newEvent = this.eventRepository.create({
        ...event,
        id: this.generateEventId(),
        timestamp: new Date(),
        version,
        processedAt: new Date(),
      });

      const savedEvent = await queryRunner.manager.save(newEvent);

      // Update snapshot if needed
      if (version % this.snapshotInterval === 0) {
        await this.createSnapshot(queryRunner.manager, event.aggregateId, event.aggregateType, version);
      }

      await queryRunner.commitTransaction();

      // Emit to subscribers
      this.emitToSubscribers(savedEvent);

      this.logger.debug(`Event appended: ${event.eventType} for ${event.aggregateType} ${event.aggregateId} v${version}`);
      
      return savedEvent;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get all events for a specific aggregate
   */
  async getEvents(aggregateId: string, options: EventQueryOptions = {}): Promise<Event[]> {
    const { limit = 1000, offset = 0, orderBy = 'ASC' } = options;

    return this.eventRepository.find({
      where: { aggregateId },
      order: { version: orderBy },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get all events since a specific timestamp
   */
  async getEventsSince(timestamp: Date, options: EventQueryOptions = {}): Promise<Event[]> {
    const { limit = 1000, offset = 0 } = options;

    return this.eventRepository.find({
      where: { timestamp: MoreThan(timestamp) },
      order: { timestamp: 'ASC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get events by type
   */
  async getEventsByType(eventType: EventType, options: EventQueryOptions = {}): Promise<Event[]> {
    const { limit = 1000, offset = 0, orderBy = 'ASC' } = options;

    return this.eventRepository.find({
      where: { eventType },
      order: { timestamp: orderBy },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get events by aggregate type
   */
  async getEventsByAggregateType(aggregateType: AggregateType, options: EventQueryOptions = {}): Promise<Event[]> {
    const { limit = 1000, offset = 0, orderBy = 'ASC' } = options;

    return this.eventRepository.find({
      where: { aggregateType },
      order: { timestamp: orderBy },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Subscribe to events
   */
  subscribeToEvents(
    callback: (event: Event) => void | Promise<void>,
    options: {
      eventType?: EventType;
      aggregateType?: AggregateType;
    } = {}
  ): string {
    const subscriptionId = this.generateSubscriptionId();
    
    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType: options.eventType,
      aggregateType: options.aggregateType,
      callback,
      active: true,
    };

    this.subscriptions.set(subscriptionId, subscription);
    
    this.logger.debug(`Subscription created: ${subscriptionId} for ${options.eventType || 'all events'}`);
    
    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.active = false;
      this.subscriptions.delete(subscriptionId);
      this.logger.debug(`Subscription removed: ${subscriptionId}`);
    }
  }

  /**
   * Get current state of an aggregate by replaying events
   */
  async getAggregateState<T = any>(
    aggregateId: string, 
    aggregateType: AggregateType,
    toVersion?: number
  ): Promise<T | null> {
    // Try to get from snapshot first
    const snapshot = await this.getLatestSnapshot(aggregateId);
    let state: any = snapshot?.data || {};
    let fromVersion = snapshot?.version || 0;

    // Get events since snapshot
    const events = await this.eventRepository.find({
      where: { 
        aggregateId,
        ...(toVersion ? { version: LessThan(toVersion) } : {})
      },
      order: { version: 'ASC' },
    });

    // Replay events
    for (const event of events) {
      if (event.version > fromVersion) {
        state = this.applyEventToState(state, event);
        fromVersion = event.version;
      }
    }

    return state as T;
  }

  /**
   * Get system state at any timestamp
   */
  async getSystemStateAt(timestamp: Date): Promise<Record<string, any>> {
    const events = await this.getEventsSince(new Date(0), { limit: 100000 });
    const state: Record<string, any> = {};

    // Group events by aggregate
    const eventsByAggregate = new Map<string, Event[]>();
    for (const event of events) {
      if (event.timestamp <= timestamp) {
        const key = `${event.aggregateType}:${event.aggregateId}`;
        if (!eventsByAggregate.has(key)) {
          eventsByAggregate.set(key, []);
        }
        eventsByAggregate.get(key)!.push(event);
      }
    }

    // Apply events to get state
    for (const [key, aggregateEvents] of eventsByAggregate) {
      const [aggregateType, aggregateId] = key.split(':');
      let aggregateState: any = {};
      
      for (const event of aggregateEvents) {
        aggregateState = this.applyEventToState(aggregateState, event);
      }
      
      state[key] = aggregateState;
    }

    return state;
  }

  /**
   * Get latest snapshot for an aggregate
   */
  private async getLatestSnapshot(aggregateId: string): Promise<Snapshot | null> {
    return this.snapshotRepository.findOne({
      where: { aggregateId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create a snapshot for an aggregate
   */
  private async createSnapshot(manager: any, aggregateId: string, aggregateType: string, version: number): Promise<Snapshot> {
    const state = await this.getAggregateState(aggregateId, aggregateType as AggregateType, version);
    
    const snapshot = manager.create(Snapshot, {
      id: this.generateSnapshotId(),
      aggregateId,
      aggregateType,
      data: state,
      version,
      eventCount: 0,
      snapshotType: 'INCREMENTAL',
      size: JSON.stringify(state).length,
    });

    const savedSnapshot = await manager.save(snapshot);
    
    this.logger.debug(`Snapshot created for ${aggregateType} ${aggregateId} at version ${version}`);
    
    return savedSnapshot;
  }

  /**
   * Apply event to state
   */
  private applyEventToState(state: any, event: Event): any {
    const handler = this.getEventHandler(event.eventType);
    if (handler) {
      return handler(state, event.data, event.metadata);
    }
    
    // Default behavior: merge event data
    return {
      ...state,
      ...event.data,
      lastUpdated: event.timestamp,
      lastEvent: event.eventType,
    };
  }

  /**
   * Get event handler for specific event types
   */
  private getEventHandler(eventType: EventType): ((state: any, data: any, metadata?: EventMetadata) => any) | null {
    const handlers: Record<EventType, (state: any, data: any, metadata?: EventMetadata) => any> = {
      [EventType.AGENT_CREATED]: (state, data) => ({ ...state, ...data }),
      [EventType.AGENT_UPDATED]: (state, data) => ({ ...state, ...data }),
      [EventType.AGENT_DELETED]: (state, data) => {
        const newState = { ...state };
        delete newState[data.id];
        return newState;
      },
      [EventType.ORACLE_DATA_UPDATED]: (state, data) => ({ ...state, ...data }),
      [EventType.TRANSACTION_CREATED]: (state, data) => ({ ...state, ...data }),
      [EventType.TRANSACTION_UPDATED]: (state, data) => ({ ...state, ...data }),
      [EventType.TRANSACTION_COMPLETED]: (state, data) => ({ ...state, ...data }),
      [EventType.SIMULATION_STARTED]: (state, data) => ({ ...state, ...data }),
      [EventType.SIMULATION_COMPLETED]: (state, data) => ({ ...state, ...data }),
      [EventType.AUDIT_LOG_CREATED]: (state, data) => ({ ...state, ...data }),
    };

    return handlers[eventType] || null;
  }

  /**
   * Emit event to subscribers
   */
  private async emitToSubscribers(event: Event): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const subscription of this.subscriptions.values()) {
      if (!subscription.active) continue;

      const matches = (!subscription.eventType || subscription.eventType === event.eventType) &&
                     (!subscription.aggregateType || subscription.aggregateType === event.aggregateType);

      if (matches) {
        promises.push(Promise.resolve(subscription.callback(event)));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Clean up old events
   */
  private async cleanupOldEvents(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.maxHistoryDays);

    const result = await this.eventRepository.delete({
      timestamp: LessThan(cutoffDate),
    });

    this.logger.log(`Cleaned up ${result.affected} old events older than ${this.maxHistoryDays} days`);
  }

  /**
   * Get event statistics
   */
  async getEventStatistics(options: { 
    eventType?: EventType; 
    aggregateType?: AggregateType;
    from?: Date; 
    to?: Date; 
  } = {}): Promise<Record<string, any>> {
    const whereConditions: any = {};
    
    if (options.eventType) {
      whereConditions.eventType = options.eventType;
    }
    
    if (options.aggregateType) {
      whereConditions.aggregateType = options.aggregateType;
    }
    
    if (options.from) {
      whereConditions.timestamp = MoreThan(options.from);
    }
    
    if (options.to) {
      whereConditions.timestamp = { ...whereConditions.timestamp, LessThan(options.to) };
    }

    const [count, avgVersion] = await Promise.all([
      this.eventRepository.count({ where: whereConditions }),
      this.eventRepository.average('version', { where: whereConditions }),
    ]);

    return {
      totalEvents: count,
      averageVersion: Math.round(avgVersion || 0),
      queryConditions: options,
    };
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSnapshotId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle event versioning for schema changes
   */
  async migrateEvent(fromVersion: number, toVersion: number): Promise<void> {
    this.logger.log(`Migrating events from version ${fromVersion} to ${toVersion}`);
    
    // Implementation would depend on specific migration requirements
    // This is a placeholder for event migration logic
    
    this.logger.log(`Event migration completed`);
  }
}
