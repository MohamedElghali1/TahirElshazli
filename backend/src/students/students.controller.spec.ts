import { Test, TestingModule } from '@nestjs/testing';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { TokenDenylistService } from '../auth/token-denylist.service.js';
import { STUDENT_REPOSITORY } from './interfaces/student-repository.interface.js';
import { InMemoryStudentRepository } from './repositories/in-memory-student.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { PASSWORD_HASHER } from '../auth/interfaces/password-hasher.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { BcryptPasswordHasher } from '../auth/bcrypt-password-hasher.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UploadsService } from '../common/storage/uploads.service.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};

describe('StudentsController', () => {
  let controller: StudentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        TokenDenylistService,
        { provide: STUDENT_REPOSITORY, useClass: InMemoryStudentRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
        { provide: UploadsService, useValue: { store: async () => 'mock-url' } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StudentsController>(StudentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return the authenticated student profile', async () => {
    const profile = await controller.getMyProfile(STUDENT);
    expect(profile).toMatchObject({ userId: 'student-1', name: 'Ali Esam' });
  });

  /**
   * `student-1`'s fixture carries all three staff fields (`DOM-3`), so this is
   * a row on which the leak is actually possible - a fixture of nulls would
   * pass whether the projection existed or not.
   */
  it('never carries a staff field on the student’s own profile', async () => {
    const profile = await controller.getMyProfile(STUDENT);
    // The **exact** key set, not `not.toHaveProperty` three times: the point is
    // that a field added to `student_profiles` later cannot arrive here either.
    expect(Object.keys(profile).sort()).toEqual(
      [
        'avatarUrl',
        'createdAt',
        'email',
        'enrolledCourseCount',
        'id',
        'name',
        'phone',
        'updatedAt',
        'userId',
      ].sort(),
    );
    const body = JSON.stringify(profile);
    // `parentEmail` is a third party's PII on a child's record; `staffNotes`
    // is staff writing about the student (`DOMAIN_MODEL.md:35`).
    expect(body).not.toContain('parent1@example.com');
    expect(body).not.toContain('titration');
    expect(body).not.toContain('El Alsson');
  });

  it('never carries a staff field on the update response either', async () => {
    const updated = await controller.updateMyProfile({ name: 'Ali E.' }, STUDENT);
    expect(updated).not.toHaveProperty('parentEmail');
    expect(updated).not.toHaveProperty('staffNotes');
    expect(updated).not.toHaveProperty('schoolName');
  });

  it('should update the profile and bump updatedAt', async () => {
    const before = await controller.getMyProfile(STUDENT);
    const updated = await controller.updateMyProfile(
      { name: 'Ali E. Esam', phone: '+201000000000' },
      STUDENT,
    );
    expect(updated.name).toBe('Ali E. Esam');
    expect(updated.phone).toBe('+201000000000');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before.updatedAt).getTime(),
    );
  });

  it('should reject an empty profile update', async () => {
    await expect(controller.updateMyProfile({}, STUDENT)).rejects.toThrow();
  });

  it('should change the password when the current one is correct', async () => {
    await expect(
      controller.changeMyPassword(
        { currentPassword: 'password123', newPassword: 'changed123' },
        STUDENT,
      ),
    ).resolves.toEqual({ success: true });
  });

  it('should reject a password change with the wrong current password', async () => {
    await expect(
      controller.changeMyPassword(
        { currentPassword: 'notmypassword', newPassword: 'changed123' },
        STUDENT,
      ),
    ).rejects.toThrow();
  });

  it('should reject reusing the current password', async () => {
    await expect(
      controller.changeMyPassword(
        { currentPassword: 'password123', newPassword: 'password123' },
        STUDENT,
      ),
    ).rejects.toThrow();
  });
});
