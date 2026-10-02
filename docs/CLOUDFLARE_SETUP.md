# Cloudflare setup — Dr. Tahir LMS

The client's Cloudflare account fronts the Hostinger VPS (`D-62`): DNS, TLS, WAF, CDN, and R2 for
student uploads (`D-59`). This is the click-path; the server side is `docs/HOSTINGER_DEPLOYMENT.md`.
Nothing here is optional except where marked.

## 1. DNS

Zone `tahirelshazli.com`, all records **Proxied** (orange cloud):

| Type | Name | Content |
|---|---|---|
| `A` | `@` | the VPS's IPv4 |
| `A` | `www` | the VPS's IPv4 |
| `A` | `api` | the VPS's IPv4 |
| `AAAA` | `@`, `www`, `api` | the VPS's IPv6, only if the VPS has one |

A grey-cloud (DNS-only) record would expose the origin and bypass the WAF; the origin firewall
(`deploy/cloudflare-firewall.sh`) would then refuse that traffic anyway.

Mail records (`MX`, SPF `TXT`, DKIM, DMARC) come from whichever SMTP provider the client picks — add
them exactly as that provider lists them, **DNS-only** (mail cannot be proxied).

## 2. SSL/TLS

1. **SSL/TLS → Overview → Full (strict).** Not *Flexible* (plaintext to the origin) and not *Full*
   (accepts any certificate).
2. **SSL/TLS → Origin Server → Create Certificate**: RSA, hostnames `tahirelshazli.com`,
   `*.tahirelshazli.com`, validity 15 years. Save the certificate to `/etc/ssl/cloudflare/origin.pem`
   and the key to `/etc/ssl/cloudflare/origin.key` on the VPS (`chmod 600` on the key) — the paths
   `deploy/nginx/tahirelshazli.conf` reads. The key is shown once.
3. **Edge Certificates:** *Always Use HTTPS* on, minimum TLS 1.2, *Automatic HTTPS Rewrites* on.
   HSTS is optional; turn it on only after the site has served over HTTPS without problems for a few
   days, and without *preload*.

## 3. Caching — never cache the application's private responses

The API's responses are per-user and carry a bearer token, and the console pages are client-rendered
behind sign-in. Cloudflare does not cache HTML or JSON by default, so the defaults are already safe;
the rules below make that explicit so a later "cache everything" change cannot leak a mark book.

**Caching → Cache Rules**, in this order:

1. **Bypass the API** — *When:* Hostname equals `api.tahirelshazli.com` → *Cache eligibility:*
   Bypass cache.
2. **Bypass every page** — *When:* Hostname is in `tahirelshazli.com`, `www.tahirelshazli.com` and
   URI Path does **not** start with `/_next/static/` → Bypass cache. The signed-in pages (`/manage`,
   `/dashboard`, `/marks`, `/homework`, …) share the hostname with the marketing site, and listing
   them one by one would go stale with the next new page; at this traffic the marketing pages do not
   need edge caching.
3. *(Optional)* **Static assets** — URI Path starts with `/_next/static/` → Eligible for cache, edge
   TTL 1 year. These files are content-hashed, so a long TTL is safe.

Never add a "Cache Everything" page rule for the zone. Leave *Rocket Loader* **off**: it rewrites
script tags, which the Content-Security-Policy in `frontend/next.config.ts` would then block.

## 4. Security

- **WAF → Managed rules:** the Cloudflare Managed Ruleset on (free plans get the free subset).
- **Bot Fight Mode:** off, or the API's JSON clients (the app itself) may be challenged. If enabled
  later, exempt `api.tahirelshazli.com`.
- **Rate limiting:** the API already limits sign-in and public routes in-process (`REM-007`). An
  edge rule is optional; if added, keep it looser than the app's (a classroom shares one IP).
- **Upload size:** the API accepts uploads up to the per-task cap (nginx allows 70 MB on `api.`).
  Cloudflare's Free and Pro plans cap request bodies at 100 MB, so no change is needed.

## 5. R2 — student uploads (`D-59`, `REM-030`)

1. **R2 → Create bucket** `tahirelshazli-uploads` (any name; it becomes `R2_BUCKET`). Location:
   automatic. **Leave public access off** — no `r2.dev` subdomain, no custom domain. The app reads
   every object through a presigned URL that expires after 15 minutes.
2. **R2 → Manage R2 API Tokens → Create API token:**
   - Permissions: **Object Read & Write**
   - Specify bucket: **only** `tahirelshazli-uploads`
   - TTL: forever (rotate by creating a new token and deleting the old one)
   Copy the *Access Key ID* and *Secret Access Key* (shown once) and the *Account ID* from the R2
   overview.
3. **Bucket CORS** (bucket → Settings → CORS policy). The marking screen fetches presigned URLs by
   script (`frontend/components/marking/use-file-bytes.ts`), which the browser refuses without this:

   ```json
   [
     {
       "AllowedOrigins": ["https://tahirelshazli.com", "https://www.tahirelshazli.com"],
       "AllowedMethods": ["GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   GET only: uploads go browser → API → R2, never browser → R2.
4. **Backups:** R2 is not covered by the nightly `pg_dump`. Turn on object versioning / a lifecycle
   copy to a second bucket if the client wants deleted or overwritten submissions recoverable
   (`HOSTINGER_DEPLOYMENT.md` §9).
5. On the VPS, in `/opt/tahirelshazli/.env`:

   ```
   STORAGE_DRIVER=r2
   R2_ACCOUNT_ID=<account id>
   R2_ACCESS_KEY_ID=<access key id>
   R2_SECRET_ACCESS_KEY=<secret access key>
   R2_BUCKET=tahirelshazli-uploads
   ```

   The API refuses to boot with `r2` and any of the four missing.

**Not yet exercised:** no real R2 round trip has run (there was no bucket during development; the
driver is unit-tested against a mocked S3 client). The first go-live check is: a student uploads a
PDF, a teacher opens it in the marking screen, and the browser console shows no CORS or CSP error.

## 6. Origin firewall

On the VPS, `sudo deploy/cloudflare-firewall.sh` allows 80/443 only from Cloudflare's published
ranges. `TRUSTED_PROXY_HOPS=2` (the API's client-IP reading) is only correct while this is in place.
Re-run it if Cloudflare changes its ranges.
