import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminAssistantsService } from './admin-assistants.service.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { ASSISTANT_INVITATION_REPOSITORY } from './interfaces/assistant-invitation-repository.interface.js';
import { InMemoryAssistantInvitationRepository } from './repositories/in-memory-assistant-invitation.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { MailService } from '../mail/mail.service.js';
import { MAIL_SENDER } from '../mail/mail-sender.interface.js';
import { MAIL_DELIVERY_REPOSITORY } from '../mail/mail-delivery.repository.js';
import { InMemoryMailDeliveryRepository } from '../mail/in-memory-mail-delivery.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { Role } from '../auth/roles.enum.js';

const TEACHER = { id: 'teacher-1', role: 'teacher' };

describe('AdminAssistantsService', () => {
  let service: AdminAssistantsService;
  let scopeRepo: InMemoryAssistantScopeRepository;
  let userRepo: InMemoryUserRepository;
  let audit: AuditService;
  let mailSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mailSend = vi.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAssistantsService,
        MailService,
        AuditService,
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: ASSISTANT_SCOPE_REPOSITORY, useClass: InMemoryAssistantScopeRepository },
        { provide: ASSISTANT_INVITATION_REPOSITORY, useClass: InMemoryAssistantInvitationRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: MAIL_SENDER, useValue: { send: mailSend } },
        { provide: MAIL_DELIVERY_REPOSITORY, useClass: InMemoryMailDeliveryRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    }).compile();

    service = module.get(AdminAssistantsService);
    scopeRepo = module.get(ASSISTANT_SCOPE_REPOSITORY);
    userRepo = module.get(USER_REPOSITORY);
    audit = module.get(AuditService);
  });

  describe('list', () => {
    it('merges real accounts and pending invitations into one shape', async () => {
      await service.invite(
        { name: 'New TA', email: 'newta@example.com', role: Role.Assistant, scope: 'all_groups' },
        TEACHER,
      );
      const list = await service.list();
      const active = list.find((a) => a.id === 'assistant-1');
      const invited = list.find((a) => a.email === 'newta@example.com');
      expect(active).toMatchObject({ status: 'active' });
      expect(invited).toMatchObject({ status: 'invited', role: Role.Assistant });
    });

    it('reports an admin as reaching every group, and an unconfigured assistant as none', async () => {
      // Neither has a scope row. The admin is unscoped by role; the assistant
      // is fail-closed - the two absent rows must not read the same.
      const unconfigured = await userRepo.create({
        email: 'unconfigured@example.com',
        passwordHash: 'x',
        name: 'Unconfigured TA',
        role: Role.Assistant,
        status: 'active',
      });
      expect(await scopeRepo.findScope('admin-1')).toBeNull();
      expect(await scopeRepo.findScope(unconfigured.id)).toBeNull();

      const list = await service.list();
      expect(list.find((a) => a.id === 'admin-1')).toMatchObject({
        role: Role.Admin,
        scope: 'all_groups',
        groupIds: [],
      });
      expect(list.find((a) => a.id === unconfigured.id)).toMatchObject({
        role: Role.Assistant,
        scope: 'assigned_groups',
        groupIds: [],
      });
    });

    it('stores all_groups for an admin whatever scope the body carried', async () => {
      // The invite panel hides Reach for an admin but still sends its last
      // value - a pending admin invitation must not list as "0 groups".
      const invited = await service.invite(
        { name: 'New Admin', email: 'newadmin@example.com', role: Role.Admin, scope: 'assigned_groups' },
        TEACHER,
      );
      expect(invited).toMatchObject({ status: 'invited', role: Role.Admin, scope: 'all_groups' });
      expect((await service.list()).find((a) => a.id === invited.id)).toMatchObject({
        scope: 'all_groups',
        groupIds: [],
      });

      // The same rule on the edit path, for the invitation and for a real account.
      const edited = await service.update(
        invited.id,
        { name: 'New Admin', email: 'newadmin@example.com', role: Role.Admin, scope: 'assigned_groups' },
        TEACHER,
      );
      expect(edited.scope).toBe('all_groups');
      await service.update(
        'admin-1',
        { name: 'Mona Saleh', email: 'admin@example.com', role: Role.Admin, scope: 'assigned_groups' },
        TEACHER,
      );
      expect(await scopeRepo.findScope('admin-1')).toBe('all_groups');
    });

    it('never widens a real assistant because the body claims role admin', async () => {
      // `update` does not change an account's role, so the stored scope must
      // follow the account's role, not the body's (re-check 2, R-2).
      expect(await scopeRepo.findScope('assistant-1')).toBe('assigned_groups');
      const result = await service.update(
        'assistant-1',
        { name: 'Nour Hassan', email: 'assistant@example.com', role: Role.Admin, scope: 'assigned_groups' },
        TEACHER,
      );
      expect(await scopeRepo.findScope('assistant-1')).toBe('assigned_groups');
      expect(result).toMatchObject({ role: Role.Assistant, scope: 'assigned_groups' });
    });
  });

  describe('invite', () => {
    it('creates a pending invitation and emails it', async () => {
      const assistant = await service.invite(
        { name: 'New TA', email: 'newta@example.com', role: Role.Assistant, scope: 'all_groups' },
        TEACHER,
      );
      expect(assistant.status).toBe('invited');
      expect(mailSend).toHaveBeenCalledTimes(1);
      const call = mailSend.mock.calls[0][0];
      expect(call.to).toBe('newta@example.com');
      expect(call.template).toBe('invitation');
      expect(typeof call.data.link).toBe('string');
      expect(call.data.link).toContain('/accept-invitation?token=');
    });

    it('audits the invite, targeting the invitation id', async () => {
      const assistant = await service.invite(
        { name: 'New TA', email: 'newta2@example.com', role: Role.Assistant, scope: 'all_groups' },
        TEACHER,
      );
      const { entries } = await audit.find({ limit: 10 });
      const entry = entries.find((e) => e.action === 'assistant.invited');
      expect(entry?.targetId).toBe(assistant.id);
      expect(entry?.actorId).toBe(TEACHER.id);
    });

    it('409s an email that already has an active account', async () => {
      await expect(
        service.invite(
          { name: 'Dup', email: 'assistant@example.com', role: Role.Assistant, scope: 'all_groups' },
          TEACHER,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('409s an email with an invitation already pending', async () => {
      await service.invite(
        { name: 'First', email: 'newta3@example.com', role: Role.Assistant, scope: 'all_groups' },
        TEACHER,
      );
      await expect(
        service.invite(
          { name: 'Second', email: 'newta3@example.com', role: Role.Assistant, scope: 'all_groups' },
          TEACHER,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('400s groupIds on an admin invite', async () => {
      await expect(
        service.invite(
          {
            name: 'New Admin',
            email: 'newadmin@example.com',
            role: Role.Admin,
            scope: 'assigned_groups',
            groupIds: ['group-1'],
          },
          TEACHER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400s assigned_groups with no groupIds', async () => {
      await expect(
        service.invite(
          { name: 'New TA', email: 'newta4@example.com', role: Role.Assistant, scope: 'assigned_groups' },
          TEACHER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400s an unknown group id', async () => {
      await expect(
        service.invite(
          {
            name: 'New TA',
            email: 'newta5@example.com',
            role: Role.Assistant,
            scope: 'assigned_groups',
            groupIds: ['no-such-group'],
          },
          TEACHER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('changes a real account’s scope and group assignments, audited', async () => {
      const before = (await service.list()).find((a) => a.id === 'assistant-2')!;
      expect(before.groupIds).toEqual([]);

      const after = await service.update(
        'assistant-2',
        { name: 'x', email: 'x@example.com', role: Role.Assistant, scope: 'assigned_groups', groupIds: ['group-2'] },
        TEACHER,
      );
      expect(after.scope).toBe('assigned_groups');
      expect(after.groupIds).toEqual(['group-2']);

      const { entries } = await audit.find({ limit: 10 });
      const entry = entries.find((e) => e.action === 'assistant.scope_changed');
      expect(entry?.targetId).toBe('assistant-2');
    });

    it('removes a group assignment that is no longer wanted', async () => {
      await scopeRepo.setScope('assistant-2', 'assigned_groups');
      await scopeRepo.assignGroup('assistant-2', 'group-1', TEACHER.id);
      await scopeRepo.assignGroup('assistant-2', 'group-2', TEACHER.id);

      const after = await service.update(
        'assistant-2',
        { name: 'x', email: 'x@example.com', role: Role.Assistant, scope: 'assigned_groups', groupIds: ['group-2'] },
        TEACHER,
      );
      expect(after.groupIds).toEqual(['group-2']);
    });

    it('edits a still-pending invitation by its own id', async () => {
      const invited = await service.invite(
        { name: 'New TA', email: 'newta6@example.com', role: Role.Assistant, scope: 'all_groups' },
        TEACHER,
      );
      const updated = await service.update(
        invited.id,
        { name: 'x', email: 'x@example.com', role: Role.Assistant, scope: 'assigned_groups', groupIds: ['group-1'] },
        TEACHER,
      );
      expect(updated.status).toBe('invited');
      expect(updated.scope).toBe('assigned_groups');
      expect(updated.groupIds).toEqual(['group-1']);
    });

    it('404s an id that names neither an account nor a pending invitation', async () => {
      await expect(
        service.update(
          'nobody',
          { name: 'x', email: 'x@example.com', role: Role.Assistant, scope: 'all_groups' },
          TEACHER,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('cancels a pending invitation', async () => {
      const invited = await service.invite(
        { name: 'New TA', email: 'newta7@example.com', role: Role.Assistant, scope: 'all_groups' },
        TEACHER,
      );
      await service.remove(invited.id, TEACHER);
      const list = await service.list();
      expect(list.find((a) => a.id === invited.id)).toBeUndefined();
    });

    it('404s a real active account rather than removing it', async () => {
      await expect(service.remove('assistant-1', TEACHER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const list = await service.list();
      expect(list.find((a) => a.id === 'assistant-1')).toBeDefined();
    });
  });

  describe('resend', () => {
    it('reissues the token and re-sends the mail', async () => {
      const invited = await service.invite(
        { name: 'New TA', email: 'newta8@example.com', role: Role.Assistant, scope: 'all_groups' },
        TEACHER,
      );
      const firstLink = mailSend.mock.calls[0][0].data.link as string;
      await service.resend(invited.id, TEACHER);
      expect(mailSend).toHaveBeenCalledTimes(2);
      const secondLink = mailSend.mock.calls[1][0].data.link as string;
      expect(secondLink).not.toBe(firstLink);
    });

    it('409s when there is nothing pending to resend', async () => {
      await expect(service.resend('assistant-1', TEACHER)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
