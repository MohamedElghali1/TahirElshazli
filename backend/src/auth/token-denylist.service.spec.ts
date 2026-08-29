import { TokenDenylistService } from './token-denylist.service.js';

describe('TokenDenylistService', () => {
  let denylist: TokenDenylistService;

  beforeEach(() => {
    denylist = new TokenDenylistService();
  });

  describe('single-session logout', () => {
    it('revokes exactly the token it was given', () => {
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      denylist.revoke('jti-1', expiry);
      expect(denylist.isRevoked('jti-1')).toBe(true);
      expect(denylist.isRevoked('jti-2')).toBe(false);
    });
  });

  describe('revokeAllForUser', () => {
    it('leaves other users alone', () => {
      denylist.revokeAllForUser('user-1');
      expect(denylist.isIssuedBeforeCutoff('user-2', Date.now() - 60_000)).toBe(
        false,
      );
    });

    it('reports no cutoff for a user who never had one', () => {
      expect(denylist.isIssuedBeforeCutoff('user-1', 1)).toBe(false);
    });

    it('revokes a token minted before the cutoff', () => {
      const before = Date.now() - 5_000;
      denylist.revokeAllForUser('user-1');
      expect(denylist.isIssuedBeforeCutoff('user-1', before)).toBe(true);
    });

    it('does NOT revoke a token minted milliseconds after the cutoff', () => {
      // The regression this exists for: a whole-second cutoff killed the token
      // issued when the user logs back in immediately after changing their
      // password - the one flow guaranteed to follow the change.
      denylist.revokeAllForUser('user-1');
      const justAfter = Date.now() + 1;
      expect(denylist.isIssuedBeforeCutoff('user-1', justAfter)).toBe(false);
    });

    it('revokes a token carrying no mint time, failing closed', () => {
      denylist.revokeAllForUser('user-1');
      expect(denylist.isIssuedBeforeCutoff('user-1', undefined)).toBe(true);
    });
  });
});
