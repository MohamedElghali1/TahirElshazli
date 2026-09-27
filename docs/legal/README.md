# Legal pages — publishing notes

`privacy-policy.md` is the source text for the `/privacy` page (`REM-015`). It was written on
2026-09-27 from the code as it stands plus the product decisions recorded as `D-58`…`D-61` in
`docs/CHANGELOG.md`. **It is a draft for the client and a qualified lawyer to review**, not legal advice.

## Fill in before publishing
Every `[[…]]` placeholder: legal name of the operator, registered/postal address, privacy contact
email (the site currently shows `hello@tahirelshazli.com`), effective date, email provider name,
hosting region (the Hostinger data centre chosen), and the retention periods in §7 (the bracketed
values are proposals).

## Promises the policy makes that the product must keep
Publish the policy only when each of these is true, or edit the policy to match.

| Policy says | Status on 2026-09-27 | Task |
|---|---|---|
| Parent/guardian consent before an under-18 creates an account | **Not built** — registration asks only name, email, password | `REM-081` |
| Uploaded files open only through short-lived links, stored with Cloudflare | **Not built** — no R2 driver yet | `REM-030` (must issue signed, expiring GET URLs) |
| Assistants see only their assigned groups | **Not true yet** on course-named routes | `REM-002` |
| Imported Google Form responses: email, answers, score, time | **Not built** | `REM-080` |
| Weekly reports to parents | Post-launch feature | `REM-031` |
| No analytics or advertising trackers | True (verified: no tracker scripts) — keep it true | — |
| Only the name is visible to other students | True (`Classmate` = `{ studentId, name }`) | — |
| No third-party image hosts on the public site | **False today**: 7 placeholder photos load from `picsum.photos` | `REM-016b` |
| Web server logs kept 14 days | Depends on the VPS logrotate setting | `HOSTINGER_DEPLOYMENT.md` §10 |
| Backups on a rolling 30-day cycle | Not scripted yet | `REM-023` |

## Also needed
- A **terms of use** page (`/terms` is linked from the footer and 404s).
- An **Arabic translation** of the policy, since the Platform serves Arabic-speaking families.
- The consent wording on the registration form should link to `/privacy`.
