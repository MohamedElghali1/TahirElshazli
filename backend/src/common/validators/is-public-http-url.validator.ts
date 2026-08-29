import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * IPv4 ranges that must never be fetched from a user-supplied URL: loopback,
 * RFC1918 private space, link-local (which covers the cloud metadata endpoint
 * at 169.254.169.254), CGNAT, and "this host".
 */
const BLOCKED_IPV4 = [
  { prefix: [0], bits: 8 }, // 0.0.0.0/8 - this host
  { prefix: [10], bits: 8 }, // private
  { prefix: [100, 64], bits: 10 }, // CGNAT
  { prefix: [127], bits: 8 }, // loopback
  { prefix: [169, 254], bits: 16 }, // link-local + cloud metadata
  { prefix: [172, 16], bits: 12 }, // private
  { prefix: [192, 168], bits: 16 }, // private
];

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function isBlockedIpv4(octets: number[]): boolean {
  return BLOCKED_IPV4.some(({ prefix, bits }) => {
    const value = octets.reduce((acc, o) => (acc << 8) + o, 0) >>> 0;
    const net = [...prefix, 0, 0, 0, 0]
      .slice(0, 4)
      .reduce((acc, o) => (acc << 8) + o, 0) >>> 0;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (net & mask);
  });
}

function isBlockedIpv6(host: string): boolean {
  // URL hostnames keep IPv6 literals in brackets.
  const inner = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!inner.includes(':')) {
    return false;
  }
  if (inner === '::1' || inner === '::') {
    return true;
  }
  // IPv4-mapped (::ffff:127.0.0.1) tunnels straight back to the blocked ranges.
  const mapped = inner.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) {
    const octets = parseIpv4(mapped[1]);
    return octets !== null && isBlockedIpv4(octets);
  }
  // Unique-local fc00::/7 and link-local fe80::/10.
  return /^f[cd]/.test(inner) || /^fe[89ab]/.test(inner);
}

export function isPublicHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return false;
  }
  if (isBlockedIpv6(host)) {
    return false;
  }
  const octets = parseIpv4(host);
  if (octets) {
    return !isBlockedIpv4(octets);
  }
  // A name, not a literal. Require a dot so bare internal hostnames are out.
  return host.includes('.');
}

/**
 * Rejects URLs that are not plain http(s) pointing at a public host.
 *
 * **This is a stopgap, not a complete SSRF defence.** It blocks literals only;
 * a hostname that *resolves* to a private address (the `127.0.0.1.nip.io`
 * trick) still passes, because catching that needs DNS resolution at
 * validation time and re-resolution at fetch time. The real fix is for clients
 * to stop supplying URLs at all - uploads should go through our own storage
 * with a server-minted key (CLAUDE.md §8). Until then, anything that fetches
 * one of these URLs must also be sandboxed.
 */
export function IsPublicHttpUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPublicHttpUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isPublicHttpUrl(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be an http(s) URL on a public host`,
      },
    });
  };
}
