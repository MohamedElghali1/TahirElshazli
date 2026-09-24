import { InMemoryGoogleIdentityRepository } from './in-memory-google-identity.repository.js';
import { GoogleIdentityConflictError } from '../interfaces/google-identity-repository.interface.js';

/** The same contract `postgres-repositories.integration-spec.ts` holds the Postgres driver to. */
describe('InMemoryGoogleIdentityRepository', () => {
  const link = { userId: 'student-1', googleSub: 'sub-1', email: 's@gmail.com', hd: null };

  it('stores, finds and removes, handing back copies', async () => {
    const repo = new InMemoryGoogleIdentityRepository();
    const created = await repo.create(link);
    const found = await repo.findBySub('sub-1');
    expect(found).toEqual(created);
    found!.email = 'mutated@x.org';
    expect((await repo.findByUser('student-1'))!.email).toBe('s@gmail.com');

    expect(await repo.removeForUser('student-1')).toEqual(created);
    expect(await repo.findBySub('sub-1')).toBeNull();
    expect(await repo.removeForUser('student-1')).toBeNull();
  });

  it('refuses a second link per user and a second user per Google account', async () => {
    const repo = new InMemoryGoogleIdentityRepository();
    await repo.create(link);
    await expect(repo.create({ ...link, googleSub: 'sub-2' })).rejects.toEqual(
      new GoogleIdentityConflictError('user'),
    );
    await expect(repo.create({ ...link, userId: 'student-2' })).rejects.toEqual(
      new GoogleIdentityConflictError('google_sub'),
    );
    expect(await repo.findByUser('student-2')).toBeNull();
  });
});
