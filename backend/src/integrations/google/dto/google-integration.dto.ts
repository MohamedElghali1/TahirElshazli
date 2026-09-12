import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The form to inspect: a Google Form editing URL, or a bare form id.
 *
 * Deliberately **not** validated as a URL here. `GoogleFormsClient.parseFormId`
 * accepts both shapes and - more importantly - produces a specific, actionable
 * message for each of the three wrong-but-plausible things a teacher pastes
 * (the `/d/e/` responder link, a `forms.gle` short link, and something that is
 * not a form at all). An `@IsUrl()` here would replace all of that with
 * "form must be a URL", which is exactly the unhelpful failure this feature
 * goes out of its way to avoid.
 *
 * The length bounds are the sanity check that belongs at the boundary
 * (CLAUDE.md §10: validate all input at the API boundary); the meaning is the
 * parser's job.
 */
export class InspectFormDto {
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  form!: string;
}
