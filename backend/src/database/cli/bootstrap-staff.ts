import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { fileURLToPath } from 'node:url';
import { isEmail } from 'class-validator';
import {
  resolveNodeEnv,
  resolvePersistenceDriver,
} from '../../common/config/env.js';
import { DatabaseModule } from '../database.module.js';
import { DatabaseService } from '../database.service.js';
import { MigrationRunner } from '../migration-runner.js';
import { Role } from '../../auth/roles.enum.js';
import type {
  StoredUser,
  UserRepository,
} from '../../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../../auth/interfaces/user-repository.interface.js';
import type { PasswordHasher } from '../../auth/interfaces/password-hasher.interface.js';
import { PASSWORD_HASHER } from '../../auth/interfaces/password-hasher.interface.js';
import { PostgresUserRepository } from '../../auth/repositories/postgres-user.repository.js';
import { BcryptPasswordHasher } from '../../auth/bcrypt-password-hasher.js';

export interface BootstrapStaffDeps {
  userRepo: UserRepository;
  hasher: PasswordHasher;
  logger?: {
    log: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}

export interface BootstrapStaffInput {
  email?: string;
  name?: string;
  password?: string;
  role?: string;
}

export interface BootstrapStaffResult {
  created: boolean;
  reason?: 'staff_exists';
  user?: StoredUser;
}

/**
 * Normalises an email address the same way the registration flow and user
 * repository do (trim + lowercase).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validates bootstrap inputs and creates the initial staff account if no
 * staff account exists yet.
 */
export async function bootstrapStaff(
  deps: BootstrapStaffDeps,
  input: BootstrapStaffInput,
): Promise<BootstrapStaffResult> {
  if (!input.email || typeof input.email !== 'string' || input.email.trim() === '') {
    throw new Error('BOOTSTRAP_EMAIL is required.');
  }
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) {
    throw new Error(`BOOTSTRAP_EMAIL must be a valid email address (got "${input.email}").`);
  }

  if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
    throw new Error('BOOTSTRAP_NAME is required.');
  }
  const name = input.name.trim();

  let role: Role.Teacher | Role.Admin = Role.Teacher;
  if (input.role !== undefined && input.role !== null && input.role.trim() !== '') {
    const rawRole = input.role.trim().toLowerCase();
    if (rawRole === 'teacher') {
      role = Role.Teacher;
    } else if (rawRole === 'admin') {
      role = Role.Admin;
    } else {
      throw new Error(
        `BOOTSTRAP_ROLE must be "teacher" or "admin" (got "${input.role}").`,
      );
    }
  }

  const password = input.password;
  if (!password || typeof password !== 'string') {
    throw new Error('BOOTSTRAP_PASSWORD is required.');
  }
  if (
    password.length < 12 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error(
      'BOOTSTRAP_PASSWORD must be at least 12 characters long and contain at least one letter and one number.',
    );
  }

  // Idempotency: if any staff account already exists, bootstrap is complete.
  const staffExists = await deps.userRepo.hasStaffAccount();
  if (staffExists) {
    deps.logger?.log('A staff account already exists; bootstrap is not needed.');
    return { created: false, reason: 'staff_exists' };
  }

  // Refuse if the email is already in use by any other account.
  const existingUser = await deps.userRepo.findByEmail(email);
  if (existingUser) {
    throw new Error(`An account with email "${email}" already exists.`);
  }

  const passwordHash = await deps.hasher.hash(password);
  const user = await deps.userRepo.create({
    email,
    passwordHash,
    name,
    role,
    status: 'active',
  });

  deps.logger?.log(`Created ${role} account for ${email}`);
  return { created: true, user };
}

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: USER_REPOSITORY, useClass: PostgresUserRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
  ],
})
export class BootstrapStaffModule {}

/**
 * `npm run db:bootstrap-staff` - creates the first staff account on a fresh database.
 *
 * An application context with no HTTP server, running pending migrations first
 * and ensuring idempotency.
 */
export async function main(): Promise<void> {
  const logger = new Logger('BootstrapStaff');
  const app = await NestFactory.createApplicationContext(BootstrapStaffModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const driver = resolvePersistenceDriver(resolveNodeEnv());
    const db = app.get(DatabaseService);
    if (driver !== 'postgres' || !db.isConfigured) {
      throw new Error(
        'No database is configured. Set PERSISTENCE_DRIVER=postgres and DATABASE_URL.',
      );
    }

    const runner = app.get(MigrationRunner);
    await runner.migrate();

    const userRepo = app.get<UserRepository>(USER_REPOSITORY);
    const hasher = app.get<PasswordHasher>(PASSWORD_HASHER);

    await bootstrapStaff(
      { userRepo, hasher, logger },
      {
        email: process.env.BOOTSTRAP_EMAIL,
        name: process.env.BOOTSTRAP_NAME,
        password: process.env.BOOTSTRAP_PASSWORD,
        role: process.env.BOOTSTRAP_ROLE,
      },
    );
  } finally {
    await app.close();
  }
}

function isDirectExecution(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  if (!process.argv[1]) {
    return false;
  }
  try {
    return (
      fileURLToPath(import.meta.url) === process.argv[1] ||
      process.argv[1].endsWith('bootstrap-staff.js') ||
      process.argv[1].endsWith('bootstrap-staff.ts')
    );
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try {
    await main();
  } catch (error) {
    new Logger('BootstrapStaff').error(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}
