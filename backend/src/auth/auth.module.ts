import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { TokenDenylistService } from './token-denylist.service.js';
import { BcryptPasswordHasher } from './bcrypt-password-hasher.js';
import type { UserRepository } from './interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from './interfaces/user-repository.interface.js';
import { PASSWORD_HASHER } from './interfaces/password-hasher.interface.js';
import { PASSWORD_RESET_NOTIFIER } from './interfaces/password-reset-notifier.interface.js';
import { LoggingPasswordResetNotifier } from './logging-password-reset-notifier.js';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository.js';
import { PostgresUserRepository } from './repositories/postgres-user.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { StudentRepositoryModule } from '../students/student-repository.module.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from './constants.js';

@Module({
  imports: [
    // register() is what actually provides AuthModuleOptions; the bare
    // PassportModule provides nothing, so JwtAuthGuard could not be constructed.
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: JWT_EXPIRES_IN },
    }),
    StudentRepositoryModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    TokenDenylistService,
    InMemoryUserRepository,
    PostgresUserRepository,
    repositoryProvider<UserRepository>(USER_REPOSITORY, InMemoryUserRepository, PostgresUserRepository),
    {
      provide: PASSWORD_HASHER,
      useClass: BcryptPasswordHasher,
    },
    {
      provide: PASSWORD_RESET_NOTIFIER,
      useClass: LoggingPasswordResetNotifier,
    },
  ],
  // PassportModule is re-exported because JwtAuthGuard extends AuthGuard('jwt'),
  // which cannot be constructed without it - every module using the guards
  // imports AuthModule to get it.
  exports: [
    JwtModule,
    PassportModule,
    USER_REPOSITORY,
    PASSWORD_HASHER,
    TokenDenylistService,
  ],
})
export class AuthModule {}
