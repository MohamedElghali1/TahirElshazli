import { isPublicHttpUrl } from './is-public-http-url.validator.js';

describe('isPublicHttpUrl', () => {
  it.each([
    'https://storage.example.com/submissions/work.pdf',
    'http://example.co.uk/a.pdf',
    'https://sub.domain.example.com:8443/path?q=1',
  ])('accepts the public URL %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(true);
  });

  it.each([
    // The payload that was demonstrated as accepted before this validator.
    'http://127.0.0.1:8080/internal',
    'http://127.255.255.254/x',
    // Cloud metadata - the highest-value SSRF target on a VPS.
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/x',
    'http://172.16.0.1/x',
    'http://172.31.255.255/x',
    'http://192.168.1.10/admin',
    'http://0.0.0.0/x',
    'http://100.64.0.1/x',
    'http://localhost:8080/internal',
    'http://api.localhost/x',
    'http://[::1]:8080/internal',
    'http://[::ffff:127.0.0.1]/x',
    'http://[fe80::1]/x',
    'http://[fc00::1]/x',
  ])('rejects the private or loopback URL %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com/x',
  ])('rejects the non-http scheme %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });

  it.each(['not a url', '', 'example.com/no-scheme'])(
    'rejects the malformed value %s',
    (url) => {
      expect(isPublicHttpUrl(url)).toBe(false);
    },
  );

  it('rejects a bare internal hostname with no dot', () => {
    expect(isPublicHttpUrl('http://intranet/reports')).toBe(false);
  });

  it('still accepts a name that resolves privately - a known limitation', () => {
    // Documented gap, asserted so it fails loudly if someone assumes otherwise:
    // catching this needs DNS resolution, and the real fix is server-side upload.
    expect(isPublicHttpUrl('http://127.0.0.1.nip.io/internal')).toBe(true);
  });

  it('rejects a non-string', () => {
    expect(isPublicHttpUrl(undefined)).toBe(false);
    expect(isPublicHttpUrl(42)).toBe(false);
  });
});
