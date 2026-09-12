import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * A thin, typed client over the two Google Forms API reads this feature needs.
 *
 * Defensive about response shapes throughout. Every field below is declared
 * optional even where the API documents it as present, because this parses a
 * third-party payload that can change without a deploy on our side, and the
 * failure mode of an over-confident parser is a 500 on a teacher's analytics
 * screen rather than a missing number.
 */

const FORMS_API = 'https://forms.googleapis.com/v1/forms';

/**
 * The form's own metadata. A deliberately small projection of a large resource
 * - enough to show the teacher what they linked and to interpret a score.
 */
export interface GoogleFormMeta {
  formId: string;
  title: string;
  /** Where students are sent. Google's own published link, never constructed. */
  responderUri: string;
  /** Quiz forms have an answer key, so responses carry a score. */
  isQuiz: boolean;
  /**
   * Total points across every graded question, or null on a non-quiz.
   * Summed from the items rather than read from a field, because the API has
   * no total - which is also why a form whose questions change mid-term will
   * change this, and why it is read at sync time rather than frozen.
   */
  totalPoints: number | null;
  /**
   * Whether responses will carry an identifiable email.
   *
   * `null` means "could not determine" rather than "no" - the setting is not
   * exposed consistently across API versions, so this is read where available
   * and otherwise inferred at sync time from whether responses actually carry
   * `respondentEmail`. Treating unknown as `false` would make the authoring
   * screen warn about correctly-configured forms, which trains people to
   * ignore the warning.
   */
  collectsEmail: boolean | null;
}

/** One student's submission of the form, as Google reports it. */
export interface GoogleFormResponse {
  responseId: string;
  /** Present only when the form collects email addresses. */
  respondentEmail: string | null;
  submittedAt: string;
  /** Present only on a quiz with an answer key. */
  totalScore: number | null;
  /** Per-question detail, kept raw for the analytics layer to interpret. */
  answers: GoogleFormAnswer[];
}

export interface GoogleFormAnswer {
  questionId: string;
  /** Free-text, choice labels, or whatever the question type produced. */
  values: string[];
  score: number | null;
  correct: boolean | null;
}

/** Raised when Google says the credential cannot see this form. */
export class GoogleFormAccessError extends Error {}

@Injectable()
export class GoogleFormsClient {
  private readonly logger = new Logger(GoogleFormsClient.name);

  /**
   * Pulls the API's form id out of whatever the teacher pasted.
   *
   * **This is the single most confusing part of the Forms API and the error
   * messages here are the feature.** A Google Form has two different
   * identifiers that both look like ids in a URL:
   *
   *   .../forms/d/<formId>/edit                 <- the real id, what the API wants
   *   .../forms/d/e/<publishedId>/viewform      <- a *different* id, useless here
   *
   * The second is the link a teacher naturally copies, because it is the one
   * they send to students. Pasting it produces a 404 from the API with nothing
   * to indicate that the id was the wrong *kind* of id rather than simply
   * wrong. So that case is detected and named explicitly: the teacher is told
   * to open the form for editing and copy the address bar, which is a
   * ten-second fix once someone says it out loud, and an afternoon otherwise.
   *
   * `forms.gle` short links get the same treatment for the same reason - they
   * redirect to the `/d/e/` form, so following them would not help.
   */
  parseFormId(input: string): string {
    const raw = input.trim();
    if (!raw) {
      throw new BadRequestException('Paste the Google Form link.');
    }

    // A bare id, already extracted. Google's ids are url-safe base64-ish and
    // comfortably longer than 20 characters; the length floor is what keeps a
    // stray word from being read as an id.
    if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) {
      return raw;
    }

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException(
        'That does not look like a Google Form link. Open the form for ' +
          'editing and copy the address from your browser - it looks like ' +
          'https://docs.google.com/forms/d/XXXX/edit',
      );
    }

    if (url.hostname === 'forms.gle') {
      throw new BadRequestException(
        'That is a short share link, which does not identify the form to the ' +
          'Google API. Open the form for editing and copy the address from ' +
          'your browser instead - it looks like ' +
          'https://docs.google.com/forms/d/XXXX/edit',
      );
    }

    const published = url.pathname.match(/\/forms\/d\/e\/([A-Za-z0-9_-]+)/);
    if (published) {
      throw new BadRequestException(
        'That is the link students use to fill in the form, which carries a ' +
          'different id from the one the Google API needs. Open the form for ' +
          'editing and copy the address from your browser - it looks like ' +
          'https://docs.google.com/forms/d/XXXX/edit (no "/e/" in it).',
      );
    }

    const edit = url.pathname.match(/\/forms\/d\/([A-Za-z0-9_-]+)/);
    if (edit) {
      return edit[1];
    }

    throw new BadRequestException(
      'No Google Form id found in that link. Open the form for editing and ' +
        'copy the address from your browser - it looks like ' +
        'https://docs.google.com/forms/d/XXXX/edit',
    );
  }

  async fetchForm(
    accessToken: string,
    formId: string,
  ): Promise<GoogleFormMeta> {
    const body = await this.get<RawForm>(
      accessToken,
      `${FORMS_API}/${encodeURIComponent(formId)}`,
      formId,
    );

    const items = body.items ?? [];
    const points = items
      .map((item) => item.questionItem?.question?.grading?.pointValue ?? 0)
      .reduce((sum, value) => sum + value, 0);
    const isQuiz = body.settings?.quizSettings?.isQuiz ?? false;

    return {
      formId: body.formId ?? formId,
      title: body.info?.title ?? body.info?.documentTitle ?? 'Untitled form',
      // Google's own published link. Never constructed from the form id -
      // the responder URL uses the *other* id (see `parseFormId`), so building
      // it here would produce a link that 404s for every student.
      responderUri: body.responderUri ?? '',
      isQuiz,
      totalPoints: isQuiz && points > 0 ? points : null,
      collectsEmail: readEmailCollection(body),
    };
  }

  /**
   * Every response to the form, following pagination.
   *
   * Unpaginated at the call site on purpose: at CLAUDE.md §7.3's numbers the
   * largest realistic answer is one group of about thirty, and a paging API
   * exposed upward would push that complexity into every caller to save
   * nothing. The loop still follows `nextPageToken`, because "about thirty"
   * is a description of today and Google's page size is not ours to assume.
   *
   * The guard on iterations is not defensive dressing: a malformed
   * `nextPageToken` that echoes itself back is an infinite loop holding an
   * HTTP handler open, and this is a third-party payload.
   */
  async fetchResponses(
    accessToken: string,
    formId: string,
  ): Promise<GoogleFormResponse[]> {
    const collected: GoogleFormResponse[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      const url = new URL(`${FORMS_API}/${encodeURIComponent(formId)}/responses`);
      url.searchParams.set('pageSize', '5000');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }
      const body = await this.get<RawResponseList>(
        accessToken,
        url.toString(),
        formId,
      );
      for (const response of body.responses ?? []) {
        collected.push(toResponse(response));
      }
      pageToken = body.nextPageToken;
      pages += 1;
    } while (pageToken && pages < 50);

    return collected;
  }

  private async get<T>(
    accessToken: string,
    url: string,
    formId: string,
  ): Promise<T> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const detail = await response.text().catch(() => '');
    this.logger.warn(
      `Google Forms API ${response.status} for form ${formId}: ${detail.slice(0, 300)}`,
    );

    // 403 and 404 both mean "this credential cannot see this form", and Google
    // returns whichever it feels like depending on whether the form exists at
    // all. They are collapsed into one message because the distinction is not
    // one the teacher can act on differently - and because telling an API
    // caller which arbitrary form ids exist is an oracle worth not offering.
    if (response.status === 403 || response.status === 404) {
      throw new GoogleFormAccessError(
        'The connected Google account cannot read that form. Check that the ' +
          'form is owned by (or shared as an editor with) the account shown on ' +
          'the integration screen, and that the link is the editing link.',
      );
    }
    if (response.status === 401) {
      throw new GoogleFormAccessError(
        'Google rejected the stored credentials. Reconnect the Google account.',
      );
    }
    throw new Error(
      `Google Forms API returned ${response.status} for form ${formId}.`,
    );
  }
}

/**
 * Reads the email-collection setting where the API exposes it.
 *
 * Returns `null` when the field is absent rather than guessing `false`. The
 * setting's representation has moved between revisions of the API, and the
 * authoring screen's warning is only useful if it is right - a warning that
 * fires on correctly-configured forms is one people learn to click past, which
 * costs more than showing nothing. When this is null, the sync infers the
 * answer from whether responses actually carry an email, which is the ground
 * truth anyway.
 */
function readEmailCollection(body: RawForm): boolean | null {
  const setting = body.settings?.emailCollectionType;
  if (typeof setting !== 'string') {
    return null;
  }
  // VERIFIED is the trustworthy mode: Google supplies the signed-in account's
  // address. RESPONDER_INPUT is a text box the student types into, which is
  // both misspellable and spoofable - it counts as collection, and the
  // matching layer is what decides how much to trust it.
  return setting === 'VERIFIED' || setting === 'RESPONDER_INPUT';
}

function toResponse(raw: RawResponse): GoogleFormResponse {
  const answers = Object.values(raw.answers ?? {}).map((answer) => ({
    questionId: answer.questionId ?? '',
    values: (answer.textAnswers?.answers ?? [])
      .map((a) => a.value)
      .filter((v): v is string => typeof v === 'string'),
    score: answer.grade?.score ?? null,
    correct: answer.grade?.correct ?? null,
  }));

  return {
    responseId: raw.responseId ?? '',
    // Empty string is normalised to null so "the form does not collect
    // emails" and "the field was blank" are the same unmatched case
    // downstream, rather than two that each need handling.
    respondentEmail: raw.respondentEmail?.trim() || null,
    submittedAt: raw.lastSubmittedTime ?? raw.createTime ?? '',
    totalScore: raw.totalScore ?? null,
    answers,
  };
}

// ---------------------------------------------------------------------------
// Raw API shapes. Everything optional - this is a third-party payload, and the
// cost of being wrong about a field being present is a 500 on a live screen.
// ---------------------------------------------------------------------------

interface RawForm {
  formId?: string;
  info?: { title?: string; documentTitle?: string };
  responderUri?: string;
  settings?: {
    quizSettings?: { isQuiz?: boolean };
    emailCollectionType?: string;
  };
  items?: {
    questionItem?: { question?: { grading?: { pointValue?: number } } };
  }[];
}

interface RawResponseList {
  responses?: RawResponse[];
  nextPageToken?: string;
}

interface RawResponse {
  responseId?: string;
  respondentEmail?: string;
  createTime?: string;
  lastSubmittedTime?: string;
  totalScore?: number;
  answers?: Record<
    string,
    {
      questionId?: string;
      textAnswers?: { answers?: { value?: string }[] };
      grade?: { score?: number; correct?: boolean };
    }
  >;
}
