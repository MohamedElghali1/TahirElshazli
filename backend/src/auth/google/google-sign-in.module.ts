import { Logger, Module } from '@nestjs/common';
import { AuthModule } from '../auth.module.js';
import { repositoryProvider } from '../../database/repository.provider.js';
import {
  resolveGoogleDriver,
  resolveGoogleSignInConfig,
  resolveNodeEnv,
  type GoogleSignInConfig,
} from '../../common/config/env.js';
import {
  GOOGLE_IDENTITY_REPOSITORY,
  type GoogleIdentityRepository,
} from './interfaces/google-identity-repository.interface.js';
import { InMemoryGoogleIdentityRepository } from './repositories/in-memory-google-identity.repository.js';
import { PostgresGoogleIdentityRepository } from './repositories/postgres-google-identity.repository.js';
import { GOOGLE_SIGN_IN_CLIENT, HttpGoogleSignInClient } from './google-sign-in.client.js';
import {
  GOOGLE_JWKS_SOURCE,
  GoogleIdTokenVerifier,
  HttpGoogleJwksSource,
  type GoogleJwksSource,
} from './google-id-token.verifier.js';
import { GOOGLE_SIGN_IN_CONFIG, GoogleSignInService } from './google-sign-in.service.js';
import { GoogleSignInController } from './google-sign-in.controller.js';

/**
 * Google sign-in (`GAUTH-1`). Every Google-facing provider resolves to
 * **null** when unconfigured - the Forms integration's shape - and the service
 * turns that into a 503 that tells the user to use their password. The config
 * is read once at wiring time.
 */
@Module({
  imports: [AuthModule],
  controllers: [GoogleSignInController],
  providers: [
    GoogleSignInService,
    InMemoryGoogleIdentityRepository,
    PostgresGoogleIdentityRepository,
    repositoryProvider<GoogleIdentityRepository>(
      GOOGLE_IDENTITY_REPOSITORY,
      InMemoryGoogleIdentityRepository,
      PostgresGoogleIdentityRepository,
    ),
    {
      provide: GOOGLE_SIGN_IN_CONFIG,
      useFactory: (): GoogleSignInConfig | null => {
        const config = resolveGoogleSignInConfig(resolveGoogleDriver(), resolveNodeEnv());
        if (!config) {
          new Logger('GoogleSignInModule').log(
            'GOOGLE_SIGN_IN_REDIRECT_URI is not set: Google sign-in is disabled; ' +
              'password sign-in is unaffected.',
          );
        }
        return config;
      },
    },
    {
      provide: GOOGLE_SIGN_IN_CLIENT,
      inject: [GOOGLE_SIGN_IN_CONFIG],
      useFactory: (config: GoogleSignInConfig | null) =>
        config ? new HttpGoogleSignInClient(config) : null,
    },
    { provide: GOOGLE_JWKS_SOURCE, useClass: HttpGoogleJwksSource },
    {
      provide: GoogleIdTokenVerifier,
      inject: [GOOGLE_SIGN_IN_CONFIG, GOOGLE_JWKS_SOURCE],
      useFactory: (config: GoogleSignInConfig | null, jwks: GoogleJwksSource) =>
        config ? new GoogleIdTokenVerifier(config.clientId, jwks) : null,
    },
  ],
})
export class GoogleSignInModule {}
