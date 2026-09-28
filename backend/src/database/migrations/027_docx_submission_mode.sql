-- 027_docx_submission_mode.sql
--
-- `REM-082`: students may hand in a Word document (.docx), not only a PDF.
-- Widens 018's `assessments.submission_modes` CHECK to admit `docx_upload`.
-- Additive only - existing rows keep whatever modes they already have.

ALTER TABLE assessments DROP CONSTRAINT assessments_submission_modes_check;
ALTER TABLE assessments ADD CONSTRAINT assessments_submission_modes_check
  CHECK (submission_modes <@ ARRAY['pdf_upload', 'docx_upload', 'doc_link', 'photo_upload']::TEXT[]);
