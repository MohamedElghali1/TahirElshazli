import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import { Role } from '../auth/roles.enum.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type {
  AssistantScope,
  AssistantScopeRepository,
} from '../staff/interfaces/assistant-scope-repository.interface.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import type {
  AssistantInvitation,
  AssistantInvitationRepository,
} from './interfaces/assistant-invitation-repository.interface.js';
import { ASSISTANT_INVITATION_REPOSITORY } from './interfaces/assistant-invitation-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { MailService } from '../mail/mail.service.js';
import { resolveFrontendUrl, resolveNodeEnv } from '../common/config/env.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import type { AssistantWriteDto } from './dto/assistant-admin.dto.js';

/** Byte-identical shape whether the row backs a real account or a still-pending invitation. */
export interface Assistant {
  id: string;
  name: string;
  email: string;
  role: Role.Assistant | Role.Admin;
  createdAt: string;
  scope: AssistantScope;
  groupIds: string[];
  status: 'invited' | 'active';
  /** `MAX(created_at)` over the audit log for this actor - last *acted*, not last seen (`PEOPLE-6`). */
  lastSeenAt: string | null;
}

/**
 * One message for "not a real assistant/admin account" and "not a pending
 * invitation either" - same anti-enumeration shape the rest of `manage/`
 * uses, and it is also just honest: from the caller's side both cases mean
 * "there is nothing here to act on".
 */
export const ASSISTANT_NOT_FOUND = 'Assistant not found';

/** A week, same order of magnitude as `AdminStudentsService`'s sign-in link. */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The assistants list, invitation flow and scope editing (`PEOPLE-4`,
 * `PEOPLE-5`, `PEOPLE-6`, `AUTH-4`).
 *
 * A pending invitation and an active account are two different tables with
 * one merged response shape - the frontend has no reason to know which one
 * it's looking at, and `AssistantWrite`/`Assistant` (`API_SPEC.yaml`) are
 * written that way on purpose.
 *
 * **`remove` is scoped to pending invitations only.** This codebase never
 * hard-deletes or deactivates an account elsewhere (`CLAUDE.md` §9 - soft
 * delete where history matters, and an assistant's audit trail is exactly
 * that history), and inventing an account-removal mechanism was not asked
 * for. A `userId` that resolves to a real account 404s here the same as an
 * unknown one. Disclosed in `docs/phases/unit-5/REVIEW_5C.md`.
 *
 * **`name`/`email` on `PATCH` are accepted by the DTO (the schema requires
 * them) but not applied.** Neither repository behind this service can rename
 * or re-email an existing account or a pending invitation - see
 * `AssistantWriteDto`'s own comment. An admin who mistyped an invitation's
 * email cancels it and re-invites.
 */
/**
 * The scope a write stores. An admin is unscoped by role, so whatever `scope`
 * the body carried for one (the invite panel hides the Reach picker for an
 * admin but still sends its last value) is stored as `all_groups` - otherwise
 * a pending admin invitation listed as reaching "0 groups" (unit-5 closure
 * re-check, R-1). Validation still runs on the body as sent.
 */
function scopeFor(input: AssistantWriteDto): AssistantScope {
  return input.role === Role.Admin ? 'all_groups' : input.scope;
}

@Injectable()
export class AdminAssistantsService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    @Inject(ASSISTANT_SCOPE_REPOSITORY)
    private readonly scopeRepo: AssistantScopeRepository,
    @Inject(ASSISTANT_INVITATION_REPOSITORY)
    private readonly invitationRepo: AssistantInvitationRepository,
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {}

  async list(): Promise<Assistant[]> {
    const users = await this.userRepo.findByRole([Role.Assistant, Role.Admin], {
      limit: 1000,
      offset: 0,
    });
    const invitations = await this.invitationRepo.findPending();
    const active = await Promise.all(users.map((user) => this.fromUser(user.id, user)));
    const invited = invitations.map((invitation) => this.fromInvitation(invitation));
    return [...active, ...invited];
  }

  async invite(input: AssistantWriteDto, actor: StaffActor): Promise<Assistant> {
    const groupIds = await this.validateWrite(input);
    const existingUser = await this.userRepo.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }
    const existingInvite = await this.invitationRepo.findPendingByEmail(input.email);
    if (existingInvite) {
      throw new ConflictException('An invitation for this email is already pending');
    }
    return this.db.runInTransaction(async () => {
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
      const invitation = await this.invitationRepo.create({
        name: input.name,
        email: input.email,
        role: input.role,
        scope: scopeFor(input),
        groupIds,
        token,
        expiresAt,
        invitedBy: actor.id,
      });
      await this.sendInvitationMail(invitation, actor);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assistant.invited',
        targetType: 'assistant',
        targetId: invitation.id,
        courseId: null,
        before: null,
        after: { name: invitation.name, email: invitation.email, role: invitation.role, scope: invitation.scope },
      });
      return this.fromInvitation(invitation);
    });
  }

  /**
   * Changes role/scope/groupIds - on a real account if `id` names one,
   * otherwise on a still-pending invitation. 404 if it names neither.
   */
  async update(id: string, input: AssistantWriteDto, actor: StaffActor): Promise<Assistant> {
    const groupIds = await this.validateWrite(input);
    const user = await this.userRepo.findById(id);
    if (user && (user.role === Role.Assistant || user.role === Role.Admin)) {
      return this.updateAccount(user.id, scopeFor(input), groupIds, actor);
    }
    return this.updateInvitation(id, input, groupIds, actor);
  }

  /** Cancels a still-pending invitation. Never removes a real account - see class doc. */
  async remove(id: string, actor: StaffActor): Promise<void> {
    return this.db.runInTransaction(async () => {
      const invitation = await this.invitationRepo.findById(id);
      if (!invitation || invitation.acceptedAt) {
        throw new NotFoundException(ASSISTANT_NOT_FOUND);
      }
      await this.invitationRepo.remove(id);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assistant.removed',
        targetType: 'assistant',
        targetId: id,
        courseId: null,
        before: { name: invitation.name, email: invitation.email },
        after: null,
      });
    });
  }

  /** 409, not 404, when there is nothing pending to resend - `API_SPEC.yaml:736-744` names no 404. */
  async resend(id: string, actor: StaffActor): Promise<{ ok: true }> {
    return this.db.runInTransaction(async () => {
      const invitation = await this.invitationRepo.findById(id);
      if (!invitation || invitation.acceptedAt) {
        throw new ConflictException('No pending invitation to resend');
      }
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
      const reissued = await this.invitationRepo.reissue(id, token, expiresAt);
      await this.sendInvitationMail(reissued!, actor);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assistant.invitation_resent',
        targetType: 'assistant',
        targetId: id,
        courseId: null,
        before: null,
        after: { email: reissued!.email, expiresAt },
      });
      return { ok: true };
    });
  }

  private async updateAccount(
    userId: string,
    scope: AssistantScope,
    groupIds: string[],
    actor: StaffActor,
  ): Promise<Assistant> {
    return this.db.runInTransaction(async () => {
      const before = await this.fromUser(userId);
      await this.scopeRepo.setScope(userId, scope);
      const current = await this.scopeRepo.findAssignments(userId);
      const currentIds = new Set(current.map((a) => a.groupId));
      const wantedIds = new Set(groupIds);
      for (const groupId of wantedIds) {
        if (!currentIds.has(groupId)) {
          await this.scopeRepo.assignGroup(userId, groupId, actor.id);
        }
      }
      for (const groupId of currentIds) {
        if (!wantedIds.has(groupId)) {
          await this.scopeRepo.unassignGroup(userId, groupId);
        }
      }
      const after = await this.fromUser(userId);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assistant.scope_changed',
        targetType: 'assistant',
        targetId: userId,
        courseId: null,
        before: { scope: before.scope, groupIds: before.groupIds.join(',') },
        after: { scope: after.scope, groupIds: after.groupIds.join(',') },
      });
      return after;
    });
  }

  private async updateInvitation(
    id: string,
    input: AssistantWriteDto,
    groupIds: string[],
    actor: StaffActor,
  ): Promise<Assistant> {
    const invitation = await this.invitationRepo.findById(id);
    if (!invitation || invitation.acceptedAt) {
      throw new NotFoundException(ASSISTANT_NOT_FOUND);
    }
    return this.db.runInTransaction(async () => {
      const updated = await this.invitationRepo.updateDetails(id, {
        role: input.role,
        scope: scopeFor(input),
        groupIds,
      });
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'assistant.scope_changed',
        targetType: 'assistant',
        targetId: id,
        courseId: null,
        before: { scope: invitation.scope, groupIds: invitation.groupIds.join(',') },
        after: { scope: updated!.scope, groupIds: updated!.groupIds.join(',') },
      });
      return this.fromInvitation(updated!);
    });
  }

  /**
   * The `scope`/`groupIds` cross-field rule (`API_SPEC.yaml:314-320`), plus
   * that every named group actually exists - a business invariant, not a
   * shape check, so it lives here rather than on the DTO (`CLAUDE.md` §6).
   */
  private async validateWrite(input: AssistantWriteDto): Promise<string[]> {
    const groupIds = input.groupIds ?? [];
    if (input.role === Role.Admin && groupIds.length > 0) {
      throw new BadRequestException('groupIds must be empty for an admin');
    }
    if (input.scope === 'all_groups' && groupIds.length > 0) {
      throw new BadRequestException('groupIds must be empty when scope is all_groups');
    }
    if (input.scope === 'assigned_groups' && input.role !== Role.Admin && groupIds.length === 0) {
      throw new BadRequestException('groupIds is required when scope is assigned_groups');
    }
    if (groupIds.length > 0) {
      const found = await this.groupRepo.findByIds(groupIds);
      const foundIds = new Set(found.map((g) => g.id));
      const missing = groupIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown group id(s): ${missing.join(', ')}`);
      }
    }
    return groupIds;
  }

  private async sendInvitationMail(invitation: AssistantInvitation, actor: StaffActor): Promise<void> {
    const inviter = await this.userRepo.findById(actor.id);
    const link = `${resolveFrontendUrl(resolveNodeEnv())}/accept-invitation?token=${invitation.token}`;
    await this.mail.send({
      to: invitation.email,
      template: 'invitation',
      data: {
        inviterName: inviter?.name ?? 'Dr. Tahir Elshazli',
        role: invitation.role,
        link,
        expiresAt: invitation.expiresAt,
      },
    });
  }

  private async fromUser(
    userId: string,
    preloaded?: { id: string; name: string; email: string; role: Role; createdAt: string },
  ): Promise<Assistant> {
    const user = preloaded ?? (await this.userRepo.findById(userId));
    const [scope, assignments, lastSeen] = await Promise.all([
      this.scopeRepo.findScope(userId),
      this.scopeRepo.findAssignments(userId),
      this.lastSeenAt(userId),
    ]);
    return {
      id: user!.id,
      name: user!.name,
      email: user!.email,
      role: user!.role as Role.Assistant | Role.Admin,
      createdAt: user!.createdAt,
      // An admin is unscoped (`STAFF_ADMIN` never passes through
      // `StaffScopeService`) and holds no scope row, so for an admin the honest
      // read is every group - reading the absent row as below told the teacher
      // their admin reached "0 groups" (unit-5 closure review, C-1).
      // For an assistant a missing row means "never configured"
      // (`AUTHORIZATION_MODEL.md` §3), not a default - `assigned_groups` with
      // no groups is the honest read, since that's exactly what an
      // unconfigured assistant may reach: nothing.
      scope: user!.role === Role.Admin ? 'all_groups' : (scope ?? 'assigned_groups'),
      groupIds: assignments.map((a) => a.groupId),
      status: 'active',
      lastSeenAt: lastSeen,
    };
  }

  private fromInvitation(invitation: AssistantInvitation): Assistant {
    return {
      id: invitation.id,
      name: invitation.name,
      email: invitation.email,
      role: invitation.role,
      createdAt: invitation.createdAt,
      scope: invitation.scope,
      groupIds: invitation.groupIds,
      status: 'invited',
      lastSeenAt: null,
    };
  }

  private async lastSeenAt(userId: string): Promise<string | null> {
    const page = await this.audit.find({ actorId: userId, limit: 1 });
    return page.entries[0]?.createdAt ?? null;
  }
}
