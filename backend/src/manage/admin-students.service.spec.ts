import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminStudentsService } from './admin-students.service.js';
import { STUDENT_REPOSITORY } from '../students/interfaces/student-repository.interface.js';
import { InMemoryStudentRepository } from '../students/repositories/in-memory-student.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { PASSWORD_HASHER } from '../auth/interfaces/password-hasher.interface.js';
import { BcryptPasswordHasher } from '../auth/bcrypt-password-hasher.js';
import { MailService } from '../mail/mail.service.js';
import { MAIL_SENDER } from '../mail/mail-sender.interface.js';
import { MAIL_DELIVERY_REPOSITORY } from '../mail/mail-delivery.repository.js';
import { InMemoryMailDeliveryRepository } from '../mail/in-memory-mail-delivery.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';

const TEACHER = { id: 'teacher-1', role: 'teacher' };

describe('AdminStudentsService', () => {
  let service: AdminStudentsService;
  let users: InMemoryUserRepository;
  let students: InMemoryStudentRepository;
  let audit: AuditService;
  let mailSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mailSend = vi.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminStudentsService,
        MailService,
        AuditService,
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: STUDENT_REPOSITORY, useClass: InMemoryStudentRepository },
        { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
        { provide: MAIL_SENDER, useValue: { send: mailSend } },
        { provide: MAIL_DELIVERY_REPOSITORY, useClass: InMemoryMailDeliveryRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    }).compile();

    service = module.get(AdminStudentsService);
    users = module.get(USER_REPOSITORY);
    students = module.get(STUDENT_REPOSITORY);
    audit = module.get(AuditService);
  });

  describe('detail', () => {
    it('returns every profile field, including the three staff-owned ones', async () => {
      const detail = await service.detail('student-1');
      expect(detail).toMatchObject({
        id: 'student-1',
        name: 'Ali Esam',
        status: 'active',
        schoolName: 'El Alsson School',
        parentEmail: 'parent1@example.com',
        staffNotes: 'Needs extra practice on titration.',
      });
    });

    it('404s an unknown id', async () => {
      await expect(service.detail('nobody')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s a non-student id', async () => {
      await expect(service.detail('teacher-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('writes only the fields it changed to the audit before/after pair', async () => {
      await service.update('student-2', { staffNotes: 'Flagged for review' }, TEACHER);
      const { entries } = await audit.find({ limit: 10 });
      const entry = entries.find((e) => e.action === 'student.updated');
      expect(entry?.before).toEqual({ staffNotes: null });
      expect(entry?.after).toEqual({ staffNotes: 'Flagged for review' });
    });

    it('actually persists the write', async () => {
      await service.update('student-2', { schoolName: 'New School' }, TEACHER);
      const profile = await students.findByUserId('student-2');
      expect(profile?.schoolName).toBe('New School');
    });

    it('null clears a nullable field', async () => {
      await service.update('student-1', { parentEmail: null }, TEACHER);
      const profile = await students.findByUserId('student-1');
      expect(profile?.parentEmail).toBeNull();
    });

    it('404s an unknown id', async () => {
      await expect(
        service.update('nobody', { staffNotes: 'x' }, TEACHER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates an already-active account with a profile', async () => {
      const detail = await service.create(
        { name: 'New Student', email: 'newstudent@example.com' },
        TEACHER,
      );
      expect(detail.status).toBe('active');
      const stored = await users.findByEmail('newstudent@example.com');
      expect(stored?.status).toBe('active');
      expect(stored?.role).toBe('student');
      const profile = await students.findByUserId(stored!.id);
      expect(profile).not.toBeNull();
    });

    it('sends a sign-in-link mail carrying a working reset token', async () => {
      await service.create(
        { name: 'New Student', email: 'newstudent2@example.com' },
        TEACHER,
      );
      expect(mailSend).toHaveBeenCalledTimes(1);
      const call = mailSend.mock.calls[0][0];
      expect(call.to).toBe('newstudent2@example.com');
      expect(call.template).toBe('sign-in-link');
      expect(typeof call.data.link).toBe('string');
      expect(call.data.link).toContain('/reset-password?token=');

      // The token in the link is a real, usable password-reset token.
      const token = new URL(call.data.link).searchParams.get('token');
      const user = await users.findByEmail('newstudent2@example.com');
      const stored = await users.findPasswordResetToken(token!);
      expect(stored?.userId).toBe(user!.id);
    });

    it('records the account with a real, unguessable password hash - not a null or empty one', async () => {
      const detail = await service.create(
        { name: 'New Student', email: 'newstudent3@example.com' },
        TEACHER,
      );
      const stored = await users.findByEmail('newstudent3@example.com');
      expect(stored?.passwordHash).toBeTruthy();
      expect(stored?.passwordHash.length).toBeGreaterThan(20);
      void detail;
    });

    it('409s a duplicate email', async () => {
      await expect(
        service.create({ name: 'Dup', email: 'student@example.com' }, TEACHER),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('audits the creation without leaking the password hash', async () => {
      await service.create(
        { name: 'New Student', email: 'newstudent4@example.com' },
        TEACHER,
      );
      const { entries } = await audit.find({ limit: 10 });
      const entry = entries.find((e) => e.action === 'student.created');
      expect(entry?.before).toBeNull();
      expect(JSON.stringify(entry?.after)).not.toMatch(/\$2[aby]\$/);
    });
  });
});
