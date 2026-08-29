import { Module } from '@nestjs/common';
import { LiveSessionsController } from './live-sessions.controller.js';
import { LiveSessionsService } from './live-sessions.service.js';
import { LIVE_SESSION_REPOSITORY } from './interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from './repositories/in-memory-live-session.repository.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [LiveSessionsController],
  providers: [
    LiveSessionsService,
    {
      provide: LIVE_SESSION_REPOSITORY,
      useClass: InMemoryLiveSessionRepository,
    },
  ],
  exports: [LiveSessionsService],
})
export class LiveSessionsModule {}
