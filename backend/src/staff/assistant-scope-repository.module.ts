import { Module } from '@nestjs/common';
import type { AssistantScopeRepository } from './interfaces/assistant-scope-repository.interface.js';
import { ASSISTANT_SCOPE_REPOSITORY } from './interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from './repositories/in-memory-assistant-scope.repository.js';
import { PostgresAssistantScopeRepository } from './repositories/postgres-assistant-scope.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';

/**
 * Holds the assistant-scope repository on its own, same reason
 * `StudentRepositoryModule` does: `StaffModule` (`StaffScopeService`'s reads)
 * and `AuthModule` (`AuthService.acceptInvitation` writes the scope an
 * invitation specified, `PEOPLE-4`/`AUTH-4`) need the *same* instance, and
 * `StaffModule` already imports `AuthModule` - importing `StaffModule` from
 * `AuthModule` for this one token would be a cycle.
 */
@Module({
  providers: [
    InMemoryAssistantScopeRepository,
    PostgresAssistantScopeRepository,
    repositoryProvider<AssistantScopeRepository>(
      ASSISTANT_SCOPE_REPOSITORY,
      InMemoryAssistantScopeRepository,
      PostgresAssistantScopeRepository,
    ),
  ],
  exports: [ASSISTANT_SCOPE_REPOSITORY],
})
export class AssistantScopeRepositoryModule {}
