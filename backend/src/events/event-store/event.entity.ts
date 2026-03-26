import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Snapshot } from './snapshot.entity';

export enum EventType {
  AGENT_CREATED = 'AGENT_CREATED',
  AGENT_UPDATED = 'AGENT_UPDATED',
  AGENT_DELETED = 'AGENT_DELETED',
  ORACLE_DATA_UPDATED = 'ORACLE_DATA_UPDATED',
  TRANSACTION_CREATED = 'TRANSACTION_CREATED',
  TRANSACTION_UPDATED = 'TRANSACTION_UPDATED',
  TRANSACTION_COMPLETED = 'TRANSACTION_COMPLETED',
  SIMULATION_STARTED = 'SIMULATION_STARTED',
  SIMULATION_COMPLETED = 'SIMULATION_COMPLETED',
  AUDIT_LOG_CREATED = 'AUDIT_LOG_CREATED',
}

export enum AggregateType {
  AGENT = 'AGENT',
  ORACLE = 'ORACLE',
  TRANSACTION = 'TRANSACTION',
  SIMULATION = 'SIMULATION',
  AUDIT_LOG = 'AUDIT_LOG',
}

export interface EventMetadata {
  userId?: string;
  correlationId?: string;
  causationId?: string;
  userAgent?: string;
  ip?: string;
  version?: string;
  [key: string]: any;
}

@Entity('events')
@Index(['aggregateId', 'version'])
@Index(['eventType'])
@Index(['aggregateType'])
@Index(['timestamp'])
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  aggregateId: string;

  @Column({ type: 'varchar', length: 50 })
  aggregateType: AggregateType;

  @Column({ type: 'varchar', length: 100 })
  eventType: EventType;

  @Column({ type: 'jsonb' })
  data: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: EventMetadata;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  timestamp: Date;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'int', nullable: true })
  eventVersion?: number;

  @ManyToOne(() => Snapshot, snapshot => snapshot.events)
  @JoinColumn({ name: 'snapshotId' })
  snapshot?: Snapshot;

  @Column({ type: 'uuid', nullable: true })
  snapshotId?: string;

  // Performance optimization fields
  @Column({ type: 'varchar', length: 100, nullable: true })
  eventId?: string; // For idempotency

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  processedAt?: Date;

  // Event stream information
  @Column({ type: 'varchar', length: 100, nullable: true })
  streamName?: string;

  @Column({ type: 'bigint', nullable: true })
  streamPosition?: number;
}
