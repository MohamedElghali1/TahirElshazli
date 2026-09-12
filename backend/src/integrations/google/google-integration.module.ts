import { Logger, Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { repositoryProvider } from '../../database/repository.provider.js';
import {
  resolveGoogleDriver,
  resolveGoogleOAuthConfig,
  resolveGoogleTokenKey,
} from '../../common/config/env.js';
import { GOOGLE_CREDENTIAL_REPOSITORY } from './interfaces/google-credential-repository.interface.js';
import type { GoogleCredentialRepository } from './interfaces/google-credential-repository.interface.js';
import { InMemoryGoogleCredentialRepository } from './repositories/in-memory-google-credential.repository.js';
import { PostgresGoogleCredentialRepository } from './repositories/postgres-google-credential.repository.js';
import { GoogleOAuthService } from './google-oauth.service.js';
import { GoogleFormsClient } from './google-forms.client.js';
import { GoogleIntegrationService } from './google-integration.service.js';
import { AdminGoogleIntegrationController } from './admin-google-integration.controller.js';
import { TokenCipher } from './token-cipher.js';

/**
 * The Google Forms integration.
 *
 * `GoogleOAuthService` and `TokenCipher` both resolve to **null** when
 * `GOOGLE_DRIVER` is unset - the same shape `StorageModule` uses for
 * `FILE_STORAGE`, and for the same reason (CLAUDE.md §3: third-party
 * subscriptions are the client's, and the code degrades sensibly until they
 * exist). `GoogleIntegrationService.require()` turns that null into a 503
 * carrying the name of the setup document, so an unconfigured server is
 * *explicable* rather than merely broken.
 *
 * The driver is read once at wiring time, matching `repositoryProvider` and
 * `StorageModule`: what is running should not change underneath a live request.
 *
 * `AuthModule` is imported for `JwtService`, which signs and verifies the OAuth
 * `state` token. That is the only reason - this module does not authenticate
 * anyone, and the `state` is a short-lived, single-purpose token that the
 * `purpose` claim keeps distinct from a session.
 */
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AdminGoogleIntegrationController],
  providers: [
    GoogleIntegrationService,
    GoogleFormsClient,
    InMemoryGoogleCredentialRepository,
    PostgresGoogleCredentialRepository,
    repositoryProvider<GoogleCredentialRepository>(
      GOOGLE_CREDENTIAL_REPOSITORY,
      InMemoryGoogleCredentialRepository,
      PostgresGoogleCredentialRepository,
    ),
    {
      provide: GoogleOAuthService,
      useFactory: () => {
        const driver = resolveGoogleDriver();
        const config = resolveGoogleOAuthConfig(driver);
        if (!config) {
          new Logger('GoogleIntegrationModule').log(
            'GOOGLE_DRIVER is not set: Google Forms analytics are disabled. ' +
              'Form-based work can still be set as a link. See ' +
              'docs/google-forms-setup.md to enable it.',
          );
          return null;
        }
        return new GoogleOAuthService(config);
      },
    },
    {
      provide: TokenCipher,
      useFactory: () => {
        const key = resolveGoogleTokenKey(resolveGoogleDriver());
        return key ? new TokenCipher(key) : null;
      },
    },
  ],
  // Exported for the work-type and analytics surfaces to come: they need an
  // access token and a forms client, and must not each rebuild the OAuth
  // plumbing. The credential repository is deliberately *not* exported - the
  // stored token has one legitimate reader and it is in this module.
  exports: [GoogleIntegrationService, GoogleFormsClient],
})
export class GoogleIntegrationModule {}
