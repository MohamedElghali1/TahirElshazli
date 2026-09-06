import { Module } from '@nestjs/common';
import { LiveSessionsController } from './live-sessions.controller.js';
import { LiveSessionsService } from './live-sessions.service.js';
import type { LiveSessionRepository } from './interfaces/live-session-repository.interface.js';
import { LIVE_SESSION_REPOSITORY } from './interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from './repositories/in-memory-live-session.repository.js';
import { PostgresLiveSessionRepository } from './repositories/postgres-live-session.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [LiveSessionsController],
  providers: [
    LiveSessionsService,
    InMemoryLiveSessionRepository,
    PostgresLiveSessionRepository,
    repositoryProvider<LiveSessionRepository>(LIVE_SESSION_REPOSITORY, InMemoryLiveSessionRepository, PostgresLiveSessionRepository),
  ],
  exports: [LiveSessionsService],
})
export class LiveSessionsModule {}
