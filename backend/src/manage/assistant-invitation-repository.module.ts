import { Module } from '@nestjs/common';
import type { AssistantInvitationRepository } from './interfaces/assistant-invitation-repository.interface.js';
import { ASSISTANT_INVITATION_REPOSITORY } from './interfaces/assistant-invitation-repository.interface.js';
import { InMemoryAssistantInvitationRepository } from './repositories/in-memory-assistant-invitation.repository.js';
import { PostgresAssistantInvitationRepository } from './repositories/postgres-assistant-invitation.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';

/**
 * Holds the invitation repository on its own, same reason
 * `StudentRepositoryModule` does: both `ManageModule` (invite/resend/list) and
 * `AuthModule` (`POST /auth/invitations/:token/accept`) need the *same*
 * instance, and importing one from the other would be a cycle.
 */
@Module({
  providers: [
    InMemoryAssistantInvitationRepository,
    PostgresAssistantInvitationRepository,
    repositoryProvider<AssistantInvitationRepository>(
      ASSISTANT_INVITATION_REPOSITORY,
      InMemoryAssistantInvitationRepository,
      PostgresAssistantInvitationRepository,
    ),
  ],
  exports: [ASSISTANT_INVITATION_REPOSITORY],
})
export class AssistantInvitationRepositoryModule {}
