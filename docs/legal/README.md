# Legal pages — publishing notes

`privacy-policy.md` and `terms-of-use.md` are the source texts for the `/privacy` and `/terms` pages
(`REM-015`). They were written on 2026-09-27 from the code as it stands after remediation run 1 plus
the product decisions `D-57`…`D-64` in `docs/CHANGELOG.md`. **They are drafts for the client and a
qualified lawyer to review**, not legal advice. The pages render a typed copy of this text kept in
`frontend/lib/`; change both together.

## Fill in before publishing
Every `[[…]]` placeholder: legal name of the operator, registered/postal address, privacy contact
email (the site currently shows `hello@tahirelshazli.com`), effective date, email provider name,
hosting region (the Hostinger data centre chosen), the retention periods in the privacy policy §7
(the bracketed values are proposals), and in the terms: the fees and refunds section (§7), the
liability cap period (§10) and the city whose courts have jurisdiction (§11).

## Promises the policy makes that the product must keep
Publish the policy only when each of these is true, or edit the policy to match.

| Policy says | Status on 2026-10-02 | Task |
|---|---|---|
| Uploaded files open only through short-lived links, stored with Cloudflare | **Built** — R2 driver, private bucket, presigned reads (15 min; 60 min for public blog media). No real-bucket round trip yet — a go-live step | `REM-030` |
| Assistants see only their assigned groups | **True** — every staff route is group-grain (`AUTH-6`) | `REM-002` |
| Imported Google Form responses: email, answers, score, time | **Built** — CSV import and results screen | `REM-080a/b` |
| Weekly reports shown to the student in the Platform, not emailed (`D-63`) | Being built (T12); until it ships the clause describes a feature not yet live | `REM-031` |
| No analytics or advertising trackers | True (verified: no tracker scripts) — keep it true | — |
| Only the name is visible to other students | True (`Classmate` = `{ studentId, name }`) | — |
| No third-party image hosts on the public site | **False today**: 7 placeholder photos load from `picsum.photos` | `REM-016b` |
| Web server logs kept 14 days | Depends on the VPS logrotate setting | `HOSTINGER_DEPLOYMENT.md` §10 |
| Backups on a rolling 30-day cycle | Scripted in T10 (`deploy/backup.sh`, 30-day default retention); true once its cron is installed | `REM-023` |

## Also needed
- An **Arabic translation** of the policy, since the Platform serves Arabic-speaking families.
- Guardian consent at registration is out of scope (`D-64`); the policy no longer promises it.
  Whether that is sufficient under Egypt's PDPL is for the client and their lawyer.
