import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../auth/roles.enum.js';
import { BcryptPasswordHasher } from '../../auth/bcrypt-password-hasher.js';
import { InMemoryUserRepository } from '../../auth/repositories/in-memory-user.repository.js';
import { bootstrapStaff } from './bootstrap-staff.js';

describe('bootstrapStaff', () => {
  const hasher = new BcryptPasswordHasher();

  it('(a) creates one active teacher when none exists and the hash verifies with the hasher', async () => {
    // Empty user repository: no teacher or admin exists
    const userRepo = InMemoryUserRepository.withUsers([]);
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await bootstrapStaff(
      { userRepo, hasher, logger },
      {
        email: '  Initial.Teacher@Example.COM ',
        name: '  First Teacher  ',
        password: 'ValidPassword123',
      },
    );

    expect(result.created).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user?.email).toBe('initial.teacher@example.com');
    expect(result.user?.name).toBe('First Teacher');
    expect(result.user?.role).toBe(Role.Teacher);
    expect(result.user?.status).toBe('active');

    // Password hash verifies with the hasher
    const verifies = await hasher.verify('ValidPassword123', result.user!.passwordHash);
    expect(verifies).toBe(true);

    // Repository now reports that a staff account exists
    expect(await userRepo.hasStaffAccount()).toBe(true);

    // Logs the one line confirming creation
    expect(logger.log).toHaveBeenCalledWith(
      'Created teacher account for initial.teacher@example.com',
    );
  });

  it('creates an active admin when role is explicitly "admin"', async () => {
    const userRepo = InMemoryUserRepository.withUsers([]);
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await bootstrapStaff(
      { userRepo, hasher, logger },
      {
        email: 'admin@example.com',
        name: 'Platform Admin',
        password: 'SecureAdminPassword456',
        role: 'admin',
      },
    );

    expect(result.created).toBe(true);
    expect(result.user?.role).toBe(Role.Admin);
    expect(result.user?.status).toBe('active');
    expect(logger.log).toHaveBeenCalledWith(
      'Created admin account for admin@example.com',
    );
  });

  it('(b) refuses to create when a teacher or admin exists', async () => {
    // Default InMemoryUserRepository has seeded teacher and admin
    const defaultRepo = new InMemoryUserRepository();
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const resultWithDefault = await bootstrapStaff(
      { userRepo: defaultRepo, hasher, logger },
      {
        email: 'new.staff@example.com',
        name: 'New Staff',
        password: 'ValidPassword123',
      },
    );

    expect(resultWithDefault.created).toBe(false);
    expect(resultWithDefault.reason).toBe('staff_exists');
    expect(resultWithDefault.user).toBeUndefined();
    expect(logger.log).toHaveBeenCalledWith(
      'A staff account already exists; bootstrap is not needed.',
    );
    expect(await defaultRepo.findByEmail('new.staff@example.com')).toBeNull();

    // Also test explicitly when only an admin exists
    const adminOnlyRepo = InMemoryUserRepository.withUsers([
      {
        id: 'admin-only',
        email: 'existing.admin@example.com',
        passwordHash: 'hash',
        role: Role.Admin,
        name: 'Existing Admin',
        createdAt: new Date().toISOString(),
        googleEmail: null,
        status: 'active',
      },
    ]);

    const resultWithAdmin = await bootstrapStaff(
      { userRepo: adminOnlyRepo, hasher, logger },
      {
        email: 'another.staff@example.com',
        name: 'Another Staff',
        password: 'ValidPassword123',
      },
    );

    expect(resultWithAdmin.created).toBe(false);
    expect(resultWithAdmin.reason).toBe('staff_exists');
    expect(await adminOnlyRepo.findByEmail('another.staff@example.com')).toBeNull();
  });

  it('(c) rejects a weak password', async () => {
    const userRepo = InMemoryUserRepository.withUsers([]);

    // Less than 12 characters
    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'teacher@example.com',
          name: 'Teacher',
          password: 'Short1',
        },
      ),
    ).rejects.toThrow(/at least 12 characters/i);

    // No digits
    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'teacher@example.com',
          name: 'Teacher',
          password: 'NoNumbersInThisPassword',
        },
      ),
    ).rejects.toThrow(/at least one letter and one number/i);

    // No letters
    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'teacher@example.com',
          name: 'Teacher',
          password: '12345678901234',
        },
      ),
    ).rejects.toThrow(/at least one letter and one number/i);

    // Missing password
    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'teacher@example.com',
          name: 'Teacher',
          password: '',
        },
      ),
    ).rejects.toThrow(/BOOTSTRAP_PASSWORD is required/i);
  });

  it('(d) rejects an invalid role', async () => {
    const userRepo = InMemoryUserRepository.withUsers([]);

    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'teacher@example.com',
          name: 'Teacher',
          password: 'ValidPassword123',
          role: 'student',
        },
      ),
    ).rejects.toThrow(/BOOTSTRAP_ROLE must be "teacher" or "admin"/i);

    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'teacher@example.com',
          name: 'Teacher',
          password: 'ValidPassword123',
          role: 'assistant',
        },
      ),
    ).rejects.toThrow(/BOOTSTRAP_ROLE must be "teacher" or "admin"/i);

    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'teacher@example.com',
          name: 'Teacher',
          password: 'ValidPassword123',
          role: 'superadmin',
        },
      ),
    ).rejects.toThrow(/BOOTSTRAP_ROLE must be "teacher" or "admin"/i);
  });

  it('(e) rejects an email already in use', async () => {
    // Repo with a student only (no staff exists)
    const userRepo = InMemoryUserRepository.withUsers([
      {
        id: 'student-1',
        email: 'student@example.com',
        passwordHash: 'hash',
        role: Role.Student,
        name: 'Existing Student',
        createdAt: new Date().toISOString(),
        googleEmail: null,
        status: 'active',
      },
    ]);

    expect(await userRepo.hasStaffAccount()).toBe(false);

    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: '  STUDENT@example.com ',
          name: 'New Teacher',
          password: 'ValidPassword123',
        },
      ),
    ).rejects.toThrow(/An account with email "student@example.com" already exists/i);

    // Confirm no staff account was created
    expect(await userRepo.hasStaffAccount()).toBe(false);
  });

  it('rejects missing or invalid email', async () => {
    const userRepo = InMemoryUserRepository.withUsers([]);

    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: '',
          name: 'Teacher',
          password: 'ValidPassword123',
        },
      ),
    ).rejects.toThrow(/BOOTSTRAP_EMAIL is required/i);

    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'not-an-email',
          name: 'Teacher',
          password: 'ValidPassword123',
        },
      ),
    ).rejects.toThrow(/BOOTSTRAP_EMAIL must be a valid email address/i);
  });

  it('rejects missing or empty name', async () => {
    const userRepo = InMemoryUserRepository.withUsers([]);

    await expect(
      bootstrapStaff(
        { userRepo, hasher },
        {
          email: 'teacher@example.com',
          name: '   ',
          password: 'ValidPassword123',
        },
      ),
    ).rejects.toThrow(/BOOTSTRAP_NAME is required/i);
  });
});
