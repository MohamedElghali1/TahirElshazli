import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GoogleFormSyncService } from './google-form-sync.service.js';
import { GoogleIntegrationService } from '../integrations/google/google-integration.service.js';
import { GoogleFormsClient, type GoogleFormResponse } from '../integrations/google/google-forms.client.js';
import { WORK_REPOSITORY } from './interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from './repositories/in-memory-work.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';

/**
 * `ingest()` is the seam `D-60` extracted from `sync()` so the CSV importer
 * and the live API path share one write. This spec covers both halves: that
 * `sync()` still does the same thing end to end through a faked Google
 * client, and that `ingest()`/`previewMatch()` work directly for a caller
 * that already has responses in hand (the CSV importer's shape).
 */
describe('GoogleFormSyncService', () => {
  let service: GoogleFormSyncService;
  let work: InMemoryWorkRepository;
  let forms: { fetchForm: ReturnType<typeof vi.fn>; fetchResponses: ReturnType<typeof vi.fn> };

  const response = (
    id: string,
    email: string | null,
    overrides: Partial<GoogleFormResponse> = {},
  ): GoogleFormResponse => ({
    responseId: id,
    respondentEmail: email,
    submittedAt: '2026-09-12T10:00:00.000Z',
    totalScore: 8,
    answers: [{ questionId: 'q1', values: ['yes'], score: null, correct: null }],
    ...overrides,
  });

  beforeEach(async () => {
    forms = {
      fetchForm: vi.fn(),
      fetchResponses: vi.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleFormSyncService,
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: GoogleIntegrationService, useValue: { accessToken: vi.fn().mockResolvedValue('tok') } },
        { provide: GoogleFormsClient, useValue: forms },
      ],
    }).compile();

    service = module.get(GoogleFormSyncService);
    work = module.get(WORK_REPOSITORY);
  });

  describe('sync()', () => {
    it('404s when no form is bound', async () => {
      await expect(service.sync('assess-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('fetches, ingests through the shared seam, and marks synced', async () => {
      await work.upsertBinding({
        assessmentId: 'assess-1',
        formId: 'form-1',
        responderUri: 'https://forms.gle/x',
        title: 'Quiz',
        isQuiz: true,
        totalPoints: 10,
        collectsEmail: true,
      });
      forms.fetchForm.mockResolvedValue({
        formId: 'form-1',
        title: 'Quiz',
        responderUri: 'https://forms.gle/x',
        isQuiz: true,
        totalPoints: 10,
        collectsEmail: true,
      });
      forms.fetchResponses.mockResolvedValue([
        response('r1', 'student@example.com'),
      ]);

      const outcome = await service.sync('assess-1');
      expect(outcome).toMatchObject({ fetched: 1, matched: 1, unmatched: 0 });

      const [stored] = await work.findResults('assess-1');
      // Unchanged shape for the API path: no `questions`/`source` added.
      expect(stored.raw).toEqual({ answers: response('r1', null).answers });

      const binding = await work.findBinding('assess-1');
      expect(binding?.lastSyncedAt).not.toBeNull();
    });
  });

  describe('ingest() (the shared seam, D-60)', () => {
    it('maps, stores, and marks synced from responses already in hand', async () => {
      const outcome = await service.ingest(
        'assess-2',
        [response('r1', 'student@example.com'), response('r2', null)],
        10,
      );
      expect(outcome).toMatchObject({ fetched: 2, matched: 1, unmatched: 1 });

      const results = await work.findResults('assess-2');
      expect(results).toHaveLength(2);
    });

    it('writes extra raw fields (questions, source) when the caller passes them (CSV path)', async () => {
      await service.ingest(
        'assess-3',
        [response('r1', 'student@example.com')],
        10,
        { questions: [{ id: 'q1', title: 'Do you agree?' }], source: 'csv' },
      );
      const [stored] = await work.findResults('assess-3');
      expect(stored.raw).toMatchObject({
        questions: [{ id: 'q1', title: 'Do you agree?' }],
        source: 'csv',
      });
    });

    it('upserts a stub binding so "last updated" has somewhere to live with no prior binding', async () => {
      expect(await work.findBinding('assess-4')).toBeNull();
      await service.ingest('assess-4', [response('r1', null)], null);
      const binding = await work.findBinding('assess-4');
      expect(binding).not.toBeNull();
      expect(binding?.lastSyncedAt).not.toBeNull();
      expect(binding?.formId).toBe('');
    });

    it('re-ingesting the same responses replaces the set rather than duplicating (idempotent import)', async () => {
      const responses = [response('r1', 'student@example.com')];
      await service.ingest('assess-5', responses, 10);
      await service.ingest('assess-5', responses, 10);
      expect(await work.findResults('assess-5')).toHaveLength(1);
    });

    it('a changed file (different externalIds) replaces the stored set', async () => {
      await service.ingest('assess-6', [response('r1', 'student@example.com')], 10);
      await service.ingest('assess-6', [response('r2', 'student@example.com')], 10);
      const results = await work.findResults('assess-6');
      expect(results.map((r) => r.externalId)).toEqual(['r2']);
    });
  });

  describe('previewMatch() (dryRun)', () => {
    it('counts matched/unmatched without writing anything', async () => {
      const preview = await service.previewMatch([
        response('r1', 'student@example.com'),
        response('r2', 'unknown@example.com'),
      ]);
      expect(preview).toEqual({ matched: 1, unmatched: 1 });
      expect(await work.findResults('assess-7')).toHaveLength(0);
    });
  });
});
