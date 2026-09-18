-- 010_work_types.sql
--
-- Work that is not a file upload.
--
-- Until now an assessment had exactly one shape: a window, a mark, and a
-- student who uploads a file or types an answer. The client's requirement is
-- that a task can equally be an external link or a Google Form, that more
-- kinds can be added later "without redesigning the entire system", and that
-- the analytics must not be hard-coded to one form.
--
-- Three tables' worth of decisions follow from that, and the load-bearing one
-- is the last: **results are stored provider-agnostically**. Nothing in
-- `external_results` says "Google". Adding Microsoft Forms, a Typeform or an
-- LTI tool later is a new `provider` value and a new client class, not a
-- migration.
--
-- Conventions follow 001-009: TEXT primary keys, TIMESTAMPTZ(3) stored UTC.

-- ============================================================
-- 1. THE WORK TYPE  (the discriminator)
-- ============================================================

-- `type` (homework/assignment/quiz) already exists and is a **category** - what
-- the work is *for*, pedagogically. This is a different axis entirely: how the
-- work is delivered and how it comes back. A Google Form quiz and a PDF
-- assignment differ on this axis and can agree on the other.
--
-- Keeping them as two columns rather than widening `type` is what stops the
-- combinatorial explosion: `type` has 3 values and `work_type` has 3, and the
-- alternative is one column with 9 and no way to ask "all quizzes" again.
--
-- DEFAULT 'file_upload' so every existing row is correct without a backfill -
-- which it is, because that is precisely what they all are.
ALTER TABLE assessments
  ADD COLUMN work_type TEXT NOT NULL DEFAULT 'file_upload'
    CHECK (work_type IN ('file_upload', 'link', 'google_form'));

-- Where a `link` task points. NULL for every other work type.
--
-- Deliberately **not** reused to hold the Google Form's URL: a form needs an
-- id, a responder URI, a quiz flag and sync state, and stuffing the first of
-- those into a column named `external_url` is how a side table gets avoided
-- once and regretted permanently. Forms get their own table below.
ALTER TABLE assessments
  ADD COLUMN external_url TEXT;

-- The CHECK that keeps the discriminator honest.
--
-- Without it, a `link` task with no URL is a task students cannot open, and the
-- failure surfaces as a blank page rather than as a refused write. Note it does
-- *not* require `external_url IS NULL` for the other types - a teacher who
-- switches a task from link to file upload should not have the write refused
-- because a stale column still holds the old URL. The read path selects on
-- `work_type`, so an ignored leftover is harmless; a missing required value is
-- not.
ALTER TABLE assessments
  ADD CONSTRAINT assessments_link_needs_url
    CHECK (work_type <> 'link' OR external_url IS NOT NULL);

-- ============================================================
-- 2. THE GOOGLE FORM BINDING
-- ============================================================

-- One row per assessment whose `work_type` is `google_form`.
--
-- A side table rather than four nullable columns on `assessments`, because the
-- relationship is genuinely one-to-at-most-one and because the sync state
-- (`last_synced_at`, `last_sync_error`) is written on a completely different
-- cadence from the assessment itself. Mixing them would mean every background
-- sync writes the assessment row and bumps whatever watches it.
CREATE TABLE assessment_google_forms (
  -- The assessment *is* the key: one form per task, and deleting the task
  -- takes the binding with it.
  assessment_id   TEXT PRIMARY KEY
                  REFERENCES assessments (id) ON DELETE CASCADE,

  -- The API's form id - the one from `/forms/d/<id>/edit`, never the one from
  -- the `/forms/d/e/<other>/viewform` link students are sent. Those are two
  -- different identifiers for the same form and confusing them is the single
  -- most likely setup mistake; `GoogleFormsClient.parseFormId` is where that
  -- is caught, with a message saying which to copy.
  form_id         TEXT NOT NULL,

  -- Google's own published link, as returned by the API. **Never constructed**
  -- from `form_id` - it uses the other identifier, so building it here would
  -- produce a link that 404s for every student.
  responder_uri   TEXT NOT NULL,

  -- Cached at bind time so the authoring screen can show what was linked
  -- without an API round trip on every render.
  title           TEXT NOT NULL DEFAULT '',

  -- Whether the form has an answer key. Non-quiz forms still sync - completion
  -- is useful on its own - they just carry no score.
  is_quiz         BOOLEAN NOT NULL DEFAULT false,

  -- Summed from the form's graded questions at sync time, not frozen at bind
  -- time: a teacher who adds a question mid-term changes the denominator, and
  -- a stale total would silently misreport every percentage.
  total_points    INTEGER,

  -- Whether responses will carry an identifiable email. Three states, and the
  -- third is the point: NULL means *could not determine*, because the setting
  -- is not exposed consistently across Forms API revisions. Treating unknown
  -- as false would make the authoring screen warn about correctly-configured
  -- forms, and a warning that cries wolf is one people click past.
  collects_email  BOOLEAN,

  bound_at        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  last_synced_at  TIMESTAMPTZ(3),

  -- The last sync failure, or NULL when the last attempt succeeded. Exists
  -- because every way this breaks is silent: a revoked grant, an expired
  -- testing-mode refresh token, a form moved to another account. Without
  -- somewhere to put the error the symptom is analytics that quietly stop
  -- updating, which nobody notices until a deadline.
  last_sync_error TEXT
);

-- "Which assessments use this form?" - normally one, but a teacher who reuses
-- a form across two courses would make it more, and the sync wants them
-- together rather than one query each.
CREATE INDEX assessment_google_forms_form_id_idx
  ON assessment_google_forms (form_id);

-- ============================================================
-- 3. EXTERNAL RESULTS  (provider-agnostic on purpose)
-- ============================================================

-- One row per response pulled from an external system.
--
-- **Nothing here names Google.** That is the requirement "do not hard-code the
-- analytics system specifically for one Google Form" expressed as a schema: a
-- provider column, an opaque external id, an identifier string, a score, and
-- the raw payload. A second provider is a new value in `provider`, a new
-- client class, and zero DDL.
--
-- It is deliberately **not** merged into `assessment_submissions`. Two reasons,
-- and both bite if ignored: a submission is a student's own act that this
-- platform witnessed and can keep immutable (§5.5), whereas this is a *mirror*
-- of a record owned elsewhere that a re-sync may legitimately overwrite; and a
-- response can arrive that matches **no student at all**, which
-- `assessment_submissions.student_id NOT NULL` cannot represent and which is
-- the single most important state in this table.
CREATE TABLE external_results (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,

  -- Which external system this came from. A CHECK rather than a free string,
  -- so adding a provider is a deliberate migration and a typo is not a silently
  -- separate provider that no reader ever queries.
  provider      TEXT NOT NULL CHECK (provider IN ('google_form')),

  -- The provider's own id for this response. Opaque here by design.
  external_id   TEXT NOT NULL,

  -- **Nullable, and that is the feature.** NULL means the response could not be
  -- attributed to a student - the form did not collect emails, or it collected
  -- one this platform does not recognise. Those responses are real data and
  -- must not be silently dropped; they go to a reconciliation queue instead.
  --
  -- CASCADE so a deleted account does not leave an orphaned mark behind.
  student_id    TEXT REFERENCES users (id) ON DELETE CASCADE,

  -- What the provider said identifies the respondent - an email address, for
  -- Google. Kept even after a match so that "why is this attributed to Ahmed?"
  -- has an answer, and so an unmatched row can be matched later without
  -- re-syncing.
  respondent_id TEXT,

  -- Nullable: a non-quiz form has no score, and completion alone is useful.
  score         NUMERIC(10, 2),
  -- The denominator *at the time of this response*. Stored per row rather than
  -- read from the form, because a teacher who adds a question mid-term changes
  -- the form's total and would otherwise retroactively alter every past
  -- percentage.
  max_score     NUMERIC(10, 2),

  -- When the respondent submitted, per the provider - never when we synced.
  submitted_at  TIMESTAMPTZ(3) NOT NULL,

  -- The provider's payload, for the per-question detail the "View" action
  -- shows. JSONB rather than a normalised answers table: the shape is the
  -- provider's and varies by question type, and normalising a foreign schema
  -- means migrating whenever they change theirs. Nothing joins on it.
  raw           JSONB NOT NULL DEFAULT '{}'::jsonb,

  synced_at     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  -- Re-syncing is an upsert, not a duplicate. Without this every sync would
  -- multiply the response count by the number of times anyone pressed refresh.
  UNIQUE (assessment_id, provider, external_id)
);

-- "This student's results" - the per-student analytics view, and the join that
-- resolves an assessment's status for a form-based task.
CREATE INDEX external_results_student_id_idx
  ON external_results (student_id, assessment_id);

-- The reconciliation queue: responses that matched nobody. Partial, because
-- once things are working correctly this index stays nearly empty - which is
-- exactly the property that makes it cheap to keep.
CREATE INDEX external_results_unmatched_idx
  ON external_results (assessment_id)
  WHERE student_id IS NULL;

-- ============================================================
-- 4. THE STUDENT'S GOOGLE ADDRESS
-- ============================================================

-- A student's LMS email and the Google account they fill forms in with are
-- frequently not the same address, and when they differ there is no way to
-- attribute a response. This is the escape hatch.
--
-- A nullable column rather than a table: it is at most one value per user, and
-- a side table would buy history nobody has asked for. Set by the student on
-- their own profile, or by staff resolving an unmatched response - which is
-- the flow that actually matters, because the student who typed the wrong
-- address is the least likely person to notice.
--
-- CITEXT would be the right type and this schema does not install the
-- extension, so matching lowercases on both sides instead; the index below
-- does the same so it is actually used.
ALTER TABLE users
  ADD COLUMN google_email TEXT;

CREATE INDEX users_google_email_idx
  ON users (lower(google_email))
  WHERE google_email IS NOT NULL;
