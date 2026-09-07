-- 001_development_fixtures.sql
--
-- DEVELOPMENT ONLY. Mirrors the fixtures the InMemory*Repository classes serve,
-- so switching PERSISTENCE_DRIVER between "memory" and "postgres" shows the same
-- screens and the same numbers.
--
-- Every account here shares one bcrypt hash of the string "password123", which
-- is published in this repository. Running this against a production database
-- would hand an account to anyone who has read the source. `npm run db:seed`
-- refuses to run when NODE_ENV=production for exactly that reason.
--
-- Idempotent: ON CONFLICT DO NOTHING throughout, so re-seeding a database that
-- already has these rows is a no-op rather than a primary-key error, and any
-- real data written on top of them is left alone.

-- ============================================================
-- Accounts
-- ============================================================

INSERT INTO users (id, email, password_hash, role, name, created_at) VALUES
  ('student-1', 'student@example.com',  '$2b$10$vH5MRaUG1QbYnIcsyN12zOEvyckQqIdz9bB93STxpIzDiIVDQF81i', 'student', 'Ali Esam',           '2026-01-15T10:00:00Z'),
  ('student-2', 'student2@example.com', '$2b$10$vH5MRaUG1QbYnIcsyN12zOEvyckQqIdz9bB93STxpIzDiIVDQF81i', 'student', 'Sara Ahmed',         '2026-03-10T08:00:00Z'),
  ('teacher-1', 'teacher@example.com',  '$2b$10$vH5MRaUG1QbYnIcsyN12zOEvyckQqIdz9bB93STxpIzDiIVDQF81i', 'teacher', 'Dr. Tahir Elshazli', '2025-11-01T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO student_profiles (id, user_id, name, email, phone, avatar_url, created_at, updated_at) VALUES
  ('profile-1', 'student-1', 'Ali Esam',   'student@example.com',  '+201234567890', NULL, '2026-01-15T10:00:00Z', '2026-08-01T12:00:00Z'),
  ('profile-2', 'student-2', 'Sara Ahmed', 'student2@example.com', NULL,            NULL, '2026-03-10T08:00:00Z', '2026-07-20T14:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Courses, modules, lessons
-- ============================================================

INSERT INTO courses (id, title, description, thumbnail_url, teacher_name, sequential_lock_enabled, default_learning_mode) VALUES
  ('course-1', 'AS Chemistry',             'Complete AS-level Chemistry course with Dr. Tahir', NULL, 'Dr. Tahir Elshazli', true,  'recorded'),
  ('course-2', 'IELTS Preparation - Live', 'Live IELTS preparation course',                     NULL, 'Dr. Tahir Elshazli', false, 'live'),
  -- A third course nobody is seeded into, so the catalog has something to
  -- enroll on out of the box. Without it every seeded student already holds
  -- every course and the Enroll button has nothing to act on.
  ('course-3', 'IGCSE English Language',   'IGCSE First Language English, Papers 1 and 2',      NULL, 'Dr. Tahir Elshazli', false, 'recorded')
ON CONFLICT (id) DO NOTHING;

INSERT INTO course_modules (id, course_id, title, chapter, position) VALUES
  ('mod-1', 'course-1', 'Atomic Structure',      'Chapter 1', 1),
  ('mod-2', 'course-1', 'Moles & Stoichiometry', 'Chapter 2', 2),
  ('mod-3', 'course-1', 'Organic Chemistry',     'Chapter 3', 3),
  ('mod-4', 'course-2', 'Speaking & Listening',  'Chapter 1', 1),
  ('mod-5', 'course-3', 'Reading & Comprehension', 'Chapter 1', 1),
  ('mod-6', 'course-3', 'Directed Writing',        'Chapter 2', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO lessons (id, module_id, title, position, duration_seconds) VALUES
  ('lesson-1',  'mod-1', 'Atomic Structure Basics',           1, 2400),
  ('lesson-2',  'mod-1', 'Electron Configuration',            2, 2100),
  ('lesson-3',  'mod-1', 'Ionisation Energy',                 3, 1980),
  ('lesson-4',  'mod-1', 'The Periodic Table',                4, 1800),
  ('lesson-5',  'mod-2', 'The Mole Concept',                  1, 2700),
  ('lesson-6',  'mod-2', 'Empirical & Molecular Formulae',    2, 2280),
  ('lesson-7',  'mod-2', 'Titration Calculations',            3, 3000),
  ('lesson-8',  'mod-2', 'Gas Volumes',                       4, 1920),
  ('lesson-9',  'mod-3', 'Alkanes',                           1, 2520),
  ('lesson-10', 'mod-3', 'Alkenes',                           2, 2640),
  ('lesson-11', 'mod-3', 'Alcohols',                          3, 2400),
  ('lesson-12', 'mod-3', 'Halogenoalkanes',                   4, 2160),
  ('lesson-13', 'mod-4', 'Introduction to IELTS Speaking',    1, 3600),
  ('lesson-14', 'mod-5', 'Reading for Implicit Meaning',      1, 2280),
  ('lesson-15', 'mod-5', 'Summary Writing Technique',         2, 2040),
  ('lesson-16', 'mod-6', 'Writing to Persuade',               1, 2460),
  ('lesson-17', 'mod-6', 'Register and Audience',             2, 2220)
ON CONFLICT (id) DO NOTHING;

INSERT INTO enrollments (student_id, course_id, learning_mode, enrolled_at) VALUES
  ('student-1', 'course-1', 'recorded', '2026-01-20T09:00:00Z'),
  ('student-1', 'course-2', 'live',     '2026-06-01T09:00:00Z'),
  ('student-2', 'course-1', 'recorded', '2026-03-15T09:00:00Z')
ON CONFLICT (student_id, course_id) DO NOTHING;

-- ============================================================
-- Materials
-- ============================================================

INSERT INTO materials (id, course_id, title, description, category, chapter, file_url, file_type, file_size_bytes, uploaded_at) VALUES
  ('mat-1', 'course-1', 'Chapter 1 Notes - Atomic Structure',      'Full lecture notes covering subatomic particles and isotopes', 'course_notes',     'Chapter 1', 'https://storage.example.com/materials/ch1-notes.pdf',         'application/pdf', 1048576, '2026-02-02T10:00:00Z'),
  ('mat-2', 'course-1', 'Chapter 2 Notes - Moles & Stoichiometry', 'Worked examples for mole calculations and titrations',        'course_notes',     'Chapter 2', 'https://storage.example.com/materials/ch2-notes.pdf',         'application/pdf', 1310720, '2026-03-02T10:00:00Z'),
  ('mat-3', 'course-1', 'Chapter 3 Notes - Organic Chemistry',     'Functional groups, nomenclature and reaction mechanisms',      'course_notes',     'Chapter 3', 'https://storage.example.com/materials/ch3-notes.pdf',         'application/pdf', 1572864, '2026-04-06T10:00:00Z'),
  ('mat-4', 'course-1', 'Practice Problems Set 1',                 'Extra practice on atomic structure and periodicity',           'study_materials',  'Chapter 1', 'https://storage.example.com/materials/practice-set1.pdf',     'application/pdf',  524288, '2026-02-20T14:00:00Z'),
  ('mat-5', 'course-1', 'Past Paper Pack 2020-2025',               'Compiled past papers with mark schemes',                       'study_materials',  NULL,        'https://storage.example.com/materials/past-papers.pdf',       'application/pdf', 6291456, '2026-05-10T14:00:00Z'),
  ('mat-6', 'course-1', 'Data Booklet',                            'Periodic table and constants sheet used in exams',             'study_materials',  NULL,        'https://storage.example.com/materials/data-booklet.pdf',      'application/pdf',  409600, '2026-01-25T14:00:00Z'),
  ('mat-7', 'course-1', 'AS Chemistry Syllabus 2026',              NULL,                                                           'important_files',  NULL,        'https://storage.example.com/materials/syllabus-2026.pdf',     'application/pdf', 2097152, '2026-01-20T08:00:00Z'),
  ('mat-8', 'course-1', 'Term 1 Timetable',                        'Live session schedule and submission deadlines',               'important_files',  NULL,        'https://storage.example.com/materials/term1-timetable.pdf',   'application/pdf',  245760, '2026-01-20T08:00:00Z'),
  ('mat-9', 'course-2', 'IELTS Speaking Tips',                     'Key tips for the IELTS speaking section',                      'course_notes',     'Chapter 1', 'https://storage.example.com/materials/ielts-speaking-tips.pdf','application/pdf', 768000, '2026-06-05T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Recordings and watch progress
-- ============================================================

INSERT INTO recordings (id, course_id, module_id, lesson_id, title, chapter, topics, video_url, duration_seconds, lesson_date, position) VALUES
  ('rec-1',  'course-1', 'mod-1', 'lesson-1',  'Atomic Structure Basics',        'Chapter 1', ARRAY['Atomic Structure'],                       'https://video.example.com/as-chem/rec-1',  2400, '2026-02-03T17:00:00Z',  1),
  ('rec-2',  'course-1', 'mod-1', 'lesson-2',  'Electron Configuration',         'Chapter 1', ARRAY['Atomic Structure'],                       'https://video.example.com/as-chem/rec-2',  2100, '2026-02-10T17:00:00Z',  2),
  ('rec-3',  'course-1', 'mod-1', 'lesson-3',  'Ionisation Energy',              'Chapter 1', ARRAY['Atomic Structure', 'Physical Chemistry'], 'https://video.example.com/as-chem/rec-3',  1980, '2026-02-17T17:00:00Z',  3),
  ('rec-4',  'course-1', 'mod-1', 'lesson-4',  'The Periodic Table',             'Chapter 1', ARRAY['Atomic Structure'],                       'https://video.example.com/as-chem/rec-4',  1800, '2026-02-24T17:00:00Z',  4),
  ('rec-5',  'course-1', 'mod-2', 'lesson-5',  'The Mole Concept',               'Chapter 2', ARRAY['Moles'],                                  'https://video.example.com/as-chem/rec-5',  2700, '2026-03-03T17:00:00Z',  5),
  ('rec-6',  'course-1', 'mod-2', 'lesson-6',  'Empirical & Molecular Formulae', 'Chapter 2', ARRAY['Moles'],                                  'https://video.example.com/as-chem/rec-6',  2280, '2026-03-10T17:00:00Z',  6),
  ('rec-7',  'course-1', 'mod-2', 'lesson-7',  'Titration Calculations',         'Chapter 2', ARRAY['Moles', 'Physical Chemistry'],            'https://video.example.com/as-chem/rec-7',  3000, '2026-03-17T17:00:00Z',  7),
  ('rec-8',  'course-1', 'mod-2', 'lesson-8',  'Gas Volumes',                    'Chapter 2', ARRAY['Moles', 'Physical Chemistry'],            'https://video.example.com/as-chem/rec-8',  1920, '2026-03-24T17:00:00Z',  8),
  ('rec-9',  'course-1', 'mod-3', 'lesson-9',  'Alkanes',                        'Chapter 3', ARRAY['Organic Chemistry'],                      'https://video.example.com/as-chem/rec-9',  2520, '2026-04-07T17:00:00Z',  9),
  ('rec-10', 'course-1', 'mod-3', 'lesson-10', 'Alkenes',                        'Chapter 3', ARRAY['Organic Chemistry'],                      'https://video.example.com/as-chem/rec-10', 2640, '2026-04-14T17:00:00Z', 10),
  ('rec-11', 'course-1', 'mod-3', 'lesson-11', 'Alcohols',                       'Chapter 3', ARRAY['Organic Chemistry'],                      'https://video.example.com/as-chem/rec-11', 2400, '2026-04-21T17:00:00Z', 11),
  ('rec-12', 'course-1', 'mod-3', 'lesson-12', 'Halogenoalkanes',                'Chapter 3', ARRAY['Organic Chemistry'],                      'https://video.example.com/as-chem/rec-12', 2160, '2026-04-28T17:00:00Z', 12)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recording_progress (recording_id, student_id, watched_seconds, completed, completed_at, updated_at) VALUES
  ('rec-1', 'student-1', 2400, true,  '2026-02-04T19:00:00Z', '2026-02-04T19:00:00Z'),
  ('rec-2', 'student-1', 2100, true,  '2026-02-11T19:00:00Z', '2026-02-11T19:00:00Z'),
  ('rec-3', 'student-1', 1980, true,  '2026-02-18T19:00:00Z', '2026-02-18T19:00:00Z'),
  ('rec-4', 'student-1', 1800, true,  '2026-02-25T19:00:00Z', '2026-02-25T19:00:00Z'),
  ('rec-5', 'student-1', 2700, true,  '2026-03-04T19:00:00Z', '2026-03-04T19:00:00Z'),
  ('rec-6', 'student-1', 1140, false, NULL,                   '2026-03-11T19:00:00Z')
ON CONFLICT (recording_id, student_id) DO NOTHING;

-- ============================================================
-- Live sessions and attendance
-- ============================================================

INSERT INTO live_sessions (id, course_id, title, zoom_link, scheduled_at, duration_minutes) VALUES
  ('sess-1', 'course-1', 'Revision: Moles & Titrations',        'https://zoom.us/j/98765432101', '2026-08-20T18:00:00Z',  90),
  ('sess-2', 'course-1', 'Organic Chemistry Q&A',               'https://zoom.us/j/98765432102', '2026-08-27T18:00:00Z',  90),
  ('sess-3', 'course-1', 'Past Paper Walkthrough - Paper 1',    'https://zoom.us/j/98765432103', '2026-09-03T18:00:00Z', 120),
  ('sess-4', 'course-2', 'IELTS Speaking Practice',             'https://zoom.us/j/12345678901', '2026-08-29T16:00:00Z',  60),
  ('sess-5', 'course-2', 'IELTS Writing Task 2 Clinic',         'https://zoom.us/j/12345678902', '2026-08-15T16:00:00Z',  60),
  ('sess-6', 'course-2', 'IELTS Listening Strategies',          'https://zoom.us/j/12345678903', '2026-08-08T16:00:00Z',  60)
ON CONFLICT (id) DO NOTHING;

INSERT INTO attendance (session_id, student_id, attended, attended_at) VALUES
  ('sess-1', 'student-1', true,  '2026-08-20T18:02:00Z'),
  ('sess-5', 'student-1', true,  '2026-08-15T16:01:00Z'),
  ('sess-6', 'student-1', false, NULL)
ON CONFLICT (session_id, student_id) DO NOTHING;

-- ============================================================
-- Assessments and submissions
-- ============================================================

INSERT INTO assessments (id, course_id, lesson_id, title, description, instructions, type, topics, available_from, available_to, due_at, max_score, allowed_file_types, max_file_size_bytes, created_at) VALUES
  ('assess-1', 'course-1', 'lesson-4',  'Periodic Trends Homework',            'Questions on periodic trends across period 3',                  'Answer all six questions. Show full working for the ionisation energy comparisons. Upload a single PDF.', 'homework',   ARRAY['Atomic Structure'],              '2026-08-10T00:00:00Z', '2026-09-30T23:59:59Z', '2026-09-05T23:59:59Z', 20, ARRAY['application/pdf'], 10485760, '2026-08-05T10:00:00Z'),
  ('assess-2', 'course-1', 'lesson-9',  'Organic Reaction Mechanisms Quiz',    'Quiz covering free-radical substitution and electrophilic addition', 'Timed quiz. Opens automatically at the scheduled time.',                                              'quiz',       ARRAY['Organic Chemistry'],             '2026-09-10T18:00:00Z', '2026-09-17T23:59:59Z', '2026-09-17T23:59:59Z', 20, ARRAY['application/pdf'], 10485760, '2026-08-20T10:00:00Z'),
  ('assess-3', 'course-1', 'lesson-7',  'Mid-term Assignment',                 'Extended titration and stoichiometry problem set',              'Complete all parts. Include calculations and units. Upload as a single PDF, maximum 10MB.',            'assignment', ARRAY['Moles', 'Physical Chemistry'],   '2026-06-01T00:00:00Z', '2026-08-30T23:59:59Z', '2026-08-28T23:59:59Z', 40, ARRAY['application/pdf'], 10485760, '2026-05-15T10:00:00Z'),
  ('assess-4', 'course-1', 'lesson-5',  'Moles Calculations Homework',         'Practice problems on the mole concept',                         'Answer questions 1-12 from the worksheet and upload your working.',                                    'homework',   ARRAY['Moles'],                         '2026-07-15T00:00:00Z', '2026-09-15T23:59:59Z', '2026-08-25T23:59:59Z', 20, ARRAY['application/pdf'], 10485760, '2026-07-10T10:00:00Z'),
  ('assess-5', 'course-1', 'lesson-11', 'Organic Nomenclature Quiz',           'Naming alkanes, alkenes and alcohols',                          'Twenty short-answer naming questions.',                                                               'quiz',       ARRAY['Organic Chemistry'],             '2026-07-01T00:00:00Z', '2026-07-14T23:59:59Z', '2026-07-14T23:59:59Z', 20, ARRAY['application/pdf'], 10485760, '2026-06-25T10:00:00Z'),
  ('assess-6', 'course-1', 'lesson-3',  'Energetics & Rates Quiz',             'Quiz on enthalpy changes and reaction rates',                   'Twenty multiple-choice questions.',                                                                   'quiz',       ARRAY['Physical Chemistry'],            '2026-06-10T00:00:00Z', '2026-06-24T23:59:59Z', '2026-06-24T23:59:59Z', 20, ARRAY['application/pdf'], 10485760, '2026-06-01T10:00:00Z'),
  ('assess-7', 'course-1', 'lesson-10', 'Organic Synthesis Assignment',        'Multi-step synthesis routes',                                   'Propose and justify a synthesis route for each target molecule.',                                      'assignment', ARRAY['Organic Chemistry'],             '2026-07-20T00:00:00Z', '2026-08-10T23:59:59Z', '2026-08-10T23:59:59Z', 40, ARRAY['application/pdf'], 10485760, '2026-07-15T10:00:00Z'),
  ('assess-8', 'course-1', 'lesson-1',  'Atomic Structure Homework',           'Subatomic particles, isotopes and mass spectrometry',           'Complete the worksheet and upload it as a PDF.',                                                       'homework',   ARRAY['Atomic Structure'],              '2026-05-01T00:00:00Z', '2026-05-20T23:59:59Z', '2026-05-20T23:59:59Z', 20, ARRAY['application/pdf'], 10485760, '2026-04-25T10:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO assessment_submissions (id, assessment_id, student_id, file_url, answer_text, submitted_at, last_submitted_at, updated_at, score, corrected_at, feedback, annotated_file_url) VALUES
  ('sub-1', 'assess-3', 'student-1', 'https://storage.example.com/submissions/midterm.pdf',      NULL, '2026-08-20T15:30:00Z', '2026-08-20T15:30:00Z', '2026-08-20T15:30:00Z',   35, '2026-08-22T10:00:00Z', 'Strong titration work. Watch significant figures in part 3.',      'https://storage.example.com/annotated/midterm-corrected.pdf'),
  ('sub-2', 'assess-4', 'student-1', 'https://storage.example.com/submissions/moles-hw.pdf',     NULL, '2026-08-24T19:10:00Z', '2026-08-24T19:10:00Z', '2026-08-24T19:10:00Z', NULL, NULL,                   NULL,                                                               NULL),
  ('sub-3', 'assess-5', 'student-1', 'https://storage.example.com/submissions/nomenclature.pdf', NULL, '2026-07-12T14:00:00Z', '2026-07-12T14:00:00Z', '2026-07-12T14:00:00Z',   18, '2026-07-15T09:00:00Z', 'Excellent. Only slipped on the halogenoalkane ordering.',           NULL),
  ('sub-4', 'assess-6', 'student-1', 'https://storage.example.com/submissions/energetics.pdf',   NULL, '2026-06-22T20:00:00Z', '2026-06-22T20:00:00Z', '2026-06-22T20:00:00Z',   12, '2026-06-25T11:00:00Z', 'Revise Hess cycles and the effect of temperature on rate.',         NULL),
  ('sub-5', 'assess-7', 'student-1', 'https://storage.example.com/submissions/synthesis.pdf',    NULL, '2026-08-08T17:45:00Z', '2026-08-08T17:45:00Z', '2026-08-08T17:45:00Z',   34, '2026-08-12T13:00:00Z', 'Good routes. Justify reagent choice more explicitly next time.',    NULL),
  ('sub-6', 'assess-8', 'student-1', 'https://storage.example.com/submissions/atomic-hw.pdf',    NULL, '2026-05-18T16:20:00Z', '2026-05-18T16:20:00Z', '2026-05-18T16:20:00Z',   16, '2026-05-21T10:30:00Z', 'Solid, but check your mass spectrometry interpretation.',           NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Report documents and notifications
-- ============================================================

INSERT INTO report_documents (id, course_id, student_id, title, period, file_url, overall_percentage, issued_at) VALUES
  ('rpt-1', 'course-1', 'student-1', 'Term Performance Report',    'Term 1 2026',  'https://storage.example.com/reports/ali-esam-term1-2026.pdf',   80, '2026-06-30T12:00:00Z'),
  ('rpt-2', 'course-1', 'student-1', 'Midterm Progress Report',    'Midterm 2026', 'https://storage.example.com/reports/ali-esam-midterm-2026.pdf', 76, '2026-04-15T12:00:00Z'),
  ('rpt-3', 'course-1', 'student-1', 'Attendance Summary',         'Term 1 2026',  'https://storage.example.com/reports/ali-esam-attendance-t1.pdf', NULL, '2026-06-30T12:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO notifications (id, user_id, type, title, message, link, read, created_at) VALUES
  ('notif-1', 'student-1', 'live_session_soon', 'Live session today',                    'Organic Chemistry Q&A starts at 18:00.',                        '/learn/course-1/sessions', false, '2026-08-27T09:00:00Z'),
  ('notif-2', 'student-1', 'grade_posted',      'Mid-term Assignment marked',            'You scored 35/40. Feedback and an annotated copy are available.', '/learn/course-1/assessments/assess-3',          false, '2026-08-22T10:05:00Z'),
  ('notif-3', 'student-1', 'grade_posted',      'Organic Synthesis Assignment marked',   'You scored 34/40.',                                             '/learn/course-1/assessments/assess-7',          true,  '2026-08-12T13:05:00Z'),
  ('notif-4', 'student-1', 'new_recording',     'New recording: Halogenoalkanes',        'Chapter 3 - Halogenoalkanes is now available to watch.',         '/learn/course-1/recordings',   true,  '2026-04-28T19:30:00Z'),
  ('notif-5', 'student-2', 'new_recording',     'New recording: Alkenes',                'Chapter 3 - Alkenes is now available to watch.',                 '/learn/course-1/recordings',   false, '2026-04-14T19:30:00Z')
ON CONFLICT (id) DO NOTHING;
