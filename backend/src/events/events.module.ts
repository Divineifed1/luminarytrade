import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Event } from './event-store/event.entity';
import { Snapshot } from './event-store/snapshot.entity';

// Services
import { EventStoreService } from './event-store/event-store.service';
import { ProjectAgentService } from './projections/project-agent.service';
import { ProjectOracleService } from './projections/project-oracle.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, Snapshot]),
  ],
  providers: [
    EventStoreService,
    ProjectAgentService,
    ProjectOracleService,
  ],
  exports: [
    EventStoreService,
    ProjectAgentService,
    ProjectOracleService,
  ],
})
export class EventsModule {}
