import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../auth/roles.enum.js';

/**
 * The body of `POST /admin/assistants` and `PATCH /admin/assistants/:userId`
 * (`AssistantWrite`, `API_SPEC.yaml`). One DTO for both: the shape is
 * identical, same as `GroupWrite`/`GroupPatch` share a body where they can.
 *
 * `name`/`email` are validated here because the schema requires them, but
 * **neither repository this DTO feeds has a rename/re-email method** -
 * `UserRepository` has no `update`, and `AssistantInvitationRepository.
 * updateDetails` only touches `role`/`scope`/`groupIds`. `AdminAssistantsService`
 * uses them on create/invite only; a PATCH silently ignores them rather than
 * inventing an account-rename feature nobody asked for (`CLAUDE.md` §0 - the
 * brief is a menu, and this wasn't ordered). Disclosed in `REVIEW_5C.md`.
 *
 * The `scope`/`groupIds` cross-field rule (`groupIds` non-empty iff
 * `scope: assigned_groups`, and empty when `role: admin`) is a business
 * invariant, not a shape check - enforced in `AdminAssistantsService`, not
 * here, the same split `CLAUDE.md` §6 draws between DTO and service.
 */
export class AssistantWriteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn([Role.Assistant, Role.Admin])
  role!: Role.Assistant | Role.Admin;

  @IsIn(['all_groups', 'assigned_groups'])
  scope!: 'all_groups' | 'assigned_groups';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  groupIds?: string[];
}
