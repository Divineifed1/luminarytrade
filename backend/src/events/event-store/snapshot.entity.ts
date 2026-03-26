import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  Index,
  OneToMany,
} from 'typeorm';
import { Event } from './event.entity';

@Entity('snapshots')
@Index(['aggregateId'])
@Index(['aggregateType'])
@Index(['createdAt'])
export class Snapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  aggregateId: string;

  @Column({ type: 'varchar', length: 50 })
  aggregateType: string;

  @Column({ type: 'jsonb' })
  data: Record<string, any>;

  @Column({ type: 'int' })
  version: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ type: 'int', default: 0 })
  eventCount: number; // Number of events since last snapshot

  @Column({ type: 'varchar', length: 50, nullable: true })
  snapshotType?: string; // e.g., 'FULL', 'INCREMENTAL'

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'int', nullable: true })
  size: number; // Snapshot size in bytes

  @OneToMany(() => Event, event => event.snapshot)
  events: Event[];

  // Performance metrics
  @Column({ type: 'int', default: 0 })
  readCount: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastReadAt?: Date;
}
