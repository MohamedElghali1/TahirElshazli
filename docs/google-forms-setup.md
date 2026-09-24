# Google Forms integration — setup and testing

This document has two audiences and they do very different amounts of work.

- **Part A is for you (the developer).** It is done once, takes about fifteen
  minutes, and involves the Google Cloud Console.
- **Part B is for Dr. Tahir.** It is one click, plus one setting per form.

That split is the entire point of choosing OAuth over the alternatives. The
other integration paths (sharing every form with a service account, or exporting
CSVs by hand) move recurring work onto the teacher forever in exchange for
saving you this one-time setup. See "Why this path" at the bottom.

---

## Part A — one-time setup (developer)

### A1. Create the Google Cloud project

1. Go to <https://console.cloud.google.com/projectcreate>.
2. Name it something recognisable — `tahirelshazli-lms` — and create it.
3. Make sure it is the selected project in the console's top bar before
   continuing. Almost every "why isn't this working" in this section is
   actually "the wrong project was selected".

### A2. Enable the Google Forms API

1. Go to **APIs & Services → Library**.
2. Search for **Google Forms API** and click **Enable**.

Nothing else needs enabling. In particular **do not** enable or request any
Drive scope — see "Why no Drive access" below.

### A3. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen.**

**User type** — this choice matters more than anything else on the page:

| If Dr. Tahir's account is… | Choose | Consequence |
|---|---|---|
| A **Google Workspace** account (e.g. `@tahirelshazli.com`) | **Internal** | No verification, no warning screen, no 7-day token expiry. Much the better path. |
| A personal **@gmail.com** account | **External** | Works, but read A6 carefully — there is a trap. |

Fill in the app name, a support email, and a developer contact email. These are
what Dr. Tahir will see on the consent screen, so use the real product name.

**Scopes** — click *Add or remove scopes* and add exactly these two:

```
https://www.googleapis.com/auth/forms.body.readonly
https://www.googleapis.com/auth/forms.responses.readonly
```

(`openid` and `email` are added automatically and need no action.)

`forms.responses.readonly` is classed by Google as a **sensitive** scope. That
is what drives the publishing-status trap in A6.

### A4. Create the OAuth client credentials

**APIs & Services → Credentials → Create credentials → OAuth client ID.**

- **Application type:** Web application
- **Name:** anything
- **Authorized redirect URIs:** add the URI for each environment you will run.
  It must match what the server sends **byte for byte** — Google compares these
  as strings, so a trailing slash or `http` vs `https` difference fails:

```
http://localhost:3001/admin/integrations/google/callback
https://api.tahirelshazli.com/admin/integrations/google/callback
```

Copy the **Client ID** and **Client secret**.

### A5. Configure the server

Generate an encryption key for the stored refresh token:

```bash
openssl rand -base64 32
```

Add to `backend/.env` (or your deployment's environment):

```bash
GOOGLE_DRIVER=google
GOOGLE_CLIENT_ID=<client id from A4>
GOOGLE_CLIENT_SECRET=<client secret from A4>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/admin/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<the base64 key you just generated>
```

Leaving `GOOGLE_DRIVER` unset disables the integration cleanly: the endpoints
answer 503 with a message naming this file, and form-based work still functions
as a plain link. Nothing breaks; you just get completion tracking instead of
scores.

**The encryption key is required in development too**, unlike `JWT_SECRET`.
That is deliberate: the token it protects is a real credential for a real
Google account from the moment anyone clicks Connect, not a fixture.

If you set `GOOGLE_DRIVER=google` and miss one of the others, the server
**refuses to start** and names the missing variable. That is intentional — a
half-configured integration that boots and fails later is worse.

### A5a. Google sign-in (optional, `GAUTH-1`)

Sign-in reuses **the same OAuth client**, so it needs `GOOGLE_DRIVER=google` and
A5's variables. It asks only for `openid email`, not the Forms scopes, and it
stores no Google token.

1. On the A4 client, add a **second** Authorized redirect URI. This one is a page
   on the **web app**, not the API:

   ```
   http://localhost:3000/google/callback
   https://tahirelshazli.com/google/callback
   ```

2. Add to the backend environment:

   ```bash
   GOOGLE_SIGN_IN_REDIRECT_URI=http://localhost:3000/google/callback
   # Staff (teacher, admin, assistants) may use Google only from these
   # Workspace domains, checked against the verified token's `hd`. Empty or
   # unset: staff keep passwords and only students can use Google.
   STAFF_GOOGLE_DOMAINS=
   ```

Without `GOOGLE_SIGN_IN_REDIRECT_URI`, Google sign-in is off: "Continue with
Google" answers with *"Google sign-in is not set up on this server. Sign in with
your password."* Password sign-in is never affected. In production the URI
must be `https`, and a malformed `STAFF_GOOGLE_DOMAINS` entry stops the boot.

**How people use it.** Nobody can create an account through Google, and a
Google account is never matched to an account by email. Each person first
signs in with their password, then chooses **Connect Google** on their Account
(staff) or Settings (student) screen. After that, "Continue with Google" works
for them.

### A6. The publishing-status trap (External user type only)

**Read this or you will lose a week.**

On the OAuth consent screen there is a **Publishing status**. While it says
**Testing**:

- You must add Dr. Tahir's Google address under **Test users**, or his consent
  will be refused outright.
- He will see an unverified-app warning and must click *Advanced → Go to … (unsafe)*.
- **Refresh tokens expire after seven days.** The integration will work
  perfectly, be demonstrated successfully, and then silently stop about a week
  later.

That last one is the dangerous one because it looks like a different bug
entirely. The app surfaces it — the integration screen shows the error and says
to reconnect — but the real fix is to click **Publish app** to move the status
to **In production**, after which refresh tokens are long-lived.

Publishing an unverified app with a sensitive scope still shows the warning
screen once, which is acceptable for a single known user. Google verification
removes the warning and is only worth pursuing if this is ever opened to more
accounts.

With **Internal** (Workspace) user type, none of this applies.

---

## Part B — what Dr. Tahir does

### B1. Connect the account (once, ever)

1. Sign in as the teacher account.
2. Go to the integration screen and click **Connect Google account**.
3. Choose the Google account **that owns the forms**. This is the step that
   matters — see B3.
4. Leave every permission ticked and click Allow.
5. The tab confirms which account was connected. Close it.

That is the whole of the recurring setup. He never does this again unless
access is revoked.

### B2. Turn on email collection — once per form

This is the one per-form step, and it cannot be avoided.

In each Google Form: **Settings → Responses → Collect email addresses →
Verified**.

Without it, Google returns responses with **no identity attached**, and there is
no way to tell which student submitted which response — not a limitation of
this application, but of the data Google provides. The app will warn on the
authoring screen when it can detect that the setting is off.

Use **Verified** rather than *Responder input* where possible: *Verified* is
the signed-in Google account and is trustworthy, whereas *Responder input* is a
text box the student types into, which can be misspelled or impersonated.

> **Tell Dr. Tahir to set this as the default on a template form and copy it**
> for each new quiz. Copying a form copies its settings, which turns a per-form
> step into a once-ever step.

### B3. The account must own the form

The Google Forms API can only read a form the connected account has **edit
access** to. It cannot read an arbitrary form from its public link, no matter
how the sharing is set.

In practice:

- Forms Dr. Tahir created on the connected account → work.
- Forms created on a *different* account → must be shared with the connected
  account as an **Editor**.

The integration screen displays which account is connected, so "it can't see my
form" has an obvious first thing to check.

### B4. Use the editing link, not the share link

When creating form-based work, paste the link from the address bar **while
editing the form**:

```
https://docs.google.com/forms/d/XXXXXXXX/edit        ✅ correct
https://docs.google.com/forms/d/e/YYYYYYYY/viewform  ❌ the student link
https://forms.gle/ZZZZ                               ❌ short link
```

The second and third contain a *different identifier* that the API cannot use.
This is genuinely confusing, so the app detects both and returns a message
saying exactly what to do instead — nobody has to know this rule in advance.

Students still get the correct fill-in link; the app reads it back from Google
rather than constructing it.

---

## Testing it end to end

Work through these in order. Each one isolates a different failure.

### T1. Server picked up the configuration

```bash
npm run dev
```

Signed in as the teacher:

```bash
curl -s http://localhost:3001/admin/integrations/google \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected before connecting:

```json
{ "configured": true, "connected": false, "googleEmail": null,
  "hasRequiredScopes": false }
```

`configured: false` means the server has no OAuth credentials — recheck A5.
Note that `configured` and `connected` are deliberately separate: the first is a
deployment problem, the second is a one-click fix.

### T2. The consent round trip

```bash
curl -s -X POST http://localhost:3001/admin/integrations/google/connect \
  -H "Authorization: Bearer $TOKEN" | jq -r .authUrl
```

Open that URL in a browser, consent, and you should land on a page saying
**Google account connected**, naming the account.

| Failure | Cause |
|---|---|
| `redirect_uri_mismatch` | A4's URI does not match `GOOGLE_OAUTH_REDIRECT_URI` exactly. |
| `access_blocked` / app not verified | Testing status and this address is not in **Test users** (A6). |
| "did not return a refresh token" | A stale prior grant. Remove the app at <https://myaccount.google.com/permissions> and retry. |

### T3. Status reflects the connection

```bash
curl -s http://localhost:3001/admin/integrations/google \
  -H "Authorization: Bearer $TOKEN" | jq
```

`connected: true`, the right `googleEmail`, and **`hasRequiredScopes: true`**.

If `hasRequiredScopes` is false, a permission was unticked on the consent
screen. Reconnect and leave them all ticked.

### T4. It can actually read a form — the real test

This is the one that proves the whole chain: stored credential → decryption →
token refresh → API authorisation → access to that specific form.

```bash
curl -s -X POST http://localhost:3001/admin/integrations/google/inspect \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"form":"https://docs.google.com/forms/d/XXXX/edit"}' | jq
```

Expected:

```json
{
  "formId": "XXXX",
  "title": "Week 1 Quiz",
  "responderUri": "https://docs.google.com/forms/d/e/.../viewform",
  "isQuiz": true,
  "totalPoints": 10,
  "collectsEmail": true
}
```

| Result | Meaning |
|---|---|
| "cannot read that form" | Wrong account connected, or the form is not shared with it (B3). |
| A message about `/e/` or `forms.gle` | The wrong link kind was pasted (B4). |
| `isQuiz: false` | Not set up as a quiz, so responses carry no score. Completion still tracks. |
| `collectsEmail: false` | B2 is not done — responses will not be attributable. |
| `collectsEmail: null` | Could not determine; it is inferred from real responses at sync time. |

### T5. The seven-day check (External only)

If the consent screen is still in **Testing**, come back a week later and run
T4 again. It will fail, and the integration screen will show the error. That is
A6, and the fix is to publish the app.

Better: publish it now and skip the experiment.

---

## Why this path

Three ways exist to read Google Form responses. This is what each costs.

| | Teacher setup | Teacher per form | Dev setup | Live data |
|---|---|---|---|---|
| **OAuth (chosen)** | one click, once | email collection on | this document | yes |
| Service account | none | **share every form** | similar | yes |
| CSV export | none | **export and upload every time** | trivial | manual |

The service-account path looks simpler because it skips the consent screen, but
it charges the teacher a sharing step *per form, forever*. Given the stated goal
— minimise what Dr. Tahir has to do — a one-time fifteen minutes of developer
setup in exchange for permanently zero recurring teacher work is the right
trade.

### Why no Drive access

Listing his forms in a picker would be nicer than pasting a URL. It needs
`drive.readonly`, which grants read access to **every file in his Google
Drive** — a *restricted* scope with a much heavier verification burden and a
far more alarming consent prompt. Pasting a URL is a small price for not asking
a client for that.

---

## Operating notes

- **Access tokens are never cached.** They last an hour and are fetched per
  sync; caching would add shared-state complexity to save a round trip nobody
  waits on.
- **The refresh token is encrypted at rest** (AES-256-GCM) under
  `GOOGLE_TOKEN_ENCRYPTION_KEY`. Rotating that key invalidates the stored
  credential — the fix is to reconnect, and the status screen says so.
- **Connect and disconnect are audited** (`google.connected` /
  `google.disconnected`, CLAUDE.md §5.4), recording the account email and
  granted scopes. The token itself is never written to the log.
- **Disconnecting revokes the grant with Google and deletes the row.** There is
  no soft delete: the audit entries are the history, and retaining a revoked
  credential would be a liability rather than a record.
- **Connecting is teacher-only.** A TA will read analytics for their own
  courses once those surfaces land, but establishing a credential that can read
  every form in Dr. Tahir's Drive stays with the teacher (CLAUDE.md §2.2).
