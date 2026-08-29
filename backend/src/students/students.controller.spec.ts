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
