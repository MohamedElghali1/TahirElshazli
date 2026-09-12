import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import { Role } from '../../auth/roles.enum.js';
import { Public } from '../../auth/public.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { OAUTH_CALLBACK_LIMIT } from '../../common/rate-limit/limits.js';
import type { JwtPayload } from '../../auth/jwt.strategy.js';
import {
  GoogleIntegrationService,
  type GoogleIntegrationStatus,
} from './google-integration.service.js';
import type { GoogleFormMeta } from './google-forms.client.js';
import { InspectFormDto } from './dto/google-integration.dto.js';

/**
 * `/admin/integrations/google/*` - connecting and disconnecting the Google
 * account, and the probe that proves it works.
 *
 * Teacher-only at class level, like every other `/admin/*` controller
 * (CLAUDE.md §5.11). A TA will *consume* this connection when the analytics
 * surfaces land, but establishing or replacing a credential that can read
 * every form in Dr. Tahir's Drive is the same class of power as payments and
 * accounts, which §2.2 keeps with the teacher. §5.11.1's "TAs see everything"
 * widened visibility and explicitly not capability.
 *
 * The one exception is `callback`, which is `@Public()` and carries its own
 * explanation.
 */
@Controller('admin/integrations/google')
@Roles(Role.Teacher)
export class AdminGoogleIntegrationController {
  constructor(private readonly google: GoogleIntegrationService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /**
   * Everything the settings screen needs to render, including the two states
   * that are easy to conflate: *the server has no OAuth credentials* and *the
   * server has them but nobody has connected an account*. The first is a
   * deployment problem and the second is a one-click fix, so they must not
   * both render as "not connected".
   */
  @Get()
  async status(): Promise<GoogleIntegrationStatus> {
    return this.google.status();
  }

  /**
   * Starts the flow. Returns the URL rather than issuing a redirect, because
   * the caller is `fetch` from an authenticated screen - a 302 here would be
   * followed by the fetch and land Google's HTML in a JSON parser. The browser
   * navigation is the frontend's to perform.
   */
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(
    @Request() req: { user: JwtPayload },
  ): Promise<{ authUrl: string }> {
    return this.google.beginConnect(this.actor(req));
  }

  /**
   * Where Google sends the teacher's browser back to.
   *
   * **`@Public()` out of necessity, not convenience.** This is reached by a
   * top-level browser redirect, which carries no `Authorization` header, so
   * there is no session for the global `JwtAuthGuard` to read - the request
   * would 401 before any handler ran. What replaces the guard is the signed
   * `state` parameter: `completeConnect` verifies its signature, its expiry and
   * its `purpose` claim before it will bind anything, so an unsigned or
   * borrowed state cannot attach an attacker's Google account to this platform.
   *
   * It answers HTML rather than JSON - uniquely in this API - because the thing
   * reading it is a browser tab that a human is looking at, not a client. It is
   * deliberately not a redirect into the frontend: that would need the web
   * origin as a second piece of configuration, and the whole point of this
   * work is to *remove* setup steps rather than add them.
   */
  @Get('callback')
  @Public()
  @RateLimit(OAUTH_CALLBACK_LIMIT)
  @Header('Content-Type', 'text/html; charset=utf-8')
  // No-store: the URL in the address bar carries a one-time code, and a cached
  // page for it is a confusing thing to find in a back button.
  @Header('Cache-Control', 'no-store')
  async callback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<string> {
    // Google sends `error=access_denied` when the user declines at the consent
    // screen. That is a normal outcome, not a failure to report as one.
    if (error) {
      return page(
        'Connection cancelled',
        `Google reported: ${escapeHtml(error)}. Nothing has been changed. ` +
          'You can close this tab and try again from the integration screen.',
      );
    }
    if (!code || !state) {
      return page(
        'Connection failed',
        'Google did not send the expected details back. Start the connection ' +
          'again from the integration screen.',
      );
    }
    try {
      const { googleEmail } = await this.google.completeConnect(code, state);
      return page(
        'Google account connected',
        `Connected as <strong>${escapeHtml(googleEmail)}</strong>. ` +
          'You can close this tab - the integration screen will show the ' +
          'connection once you refresh it.',
      );
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Unknown error.';
      return page('Connection failed', escapeHtml(message));
    }
  }

  /** Revokes the grant with Google and deletes the stored credential. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@Request() req: { user: JwtPayload }): Promise<void> {
    await this.google.disconnect(this.actor(req));
  }

  /**
   * Reads a form's metadata - the "prove it works" call.
   *
   * This exercises the entire chain in one request: the stored credential, its
   * decryption, a token refresh against Google, API authorisation, and access
   * to that specific form. It exists because every *other* way of finding out
   * that the integration is misconfigured involves a class of students and a
   * deadline.
   *
   * It also doubles as the validation behind the authoring form once work types
   * land - which is when it moves to the staff controller, since §2.2 lets a TA
   * author. It is teacher-only today because nothing else consumes it yet, and
   * widening a route later is cheaper than narrowing one.
   */
  @Post('inspect')
  @HttpCode(HttpStatus.OK)
  async inspect(@Body() body: InspectFormDto): Promise<GoogleFormMeta> {
    return this.google.inspectForm(body.form);
  }
}

/**
 * The callback's response body.
 *
 * Inline styles and no assets: this page is served by the API, which hosts no
 * stylesheet and should not start. It is three sentences in a tab the user is
 * about to close, so the bar is "legible and not alarming", not "on brand".
 */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 34rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.6; color: #1c1c1f;">
<h1 style="font-size: 1.25rem; margin: 0 0 0.75rem;">${escapeHtml(title)}</h1>
<p style="margin: 0; color: #52525b;">${body}</p>
</body>
</html>`;
}

/**
 * Escapes text interpolated into the page above.
 *
 * Both values that reach it are attacker-influenced in principle - `error`
 * comes straight off the query string, and `message` can carry text from
 * Google's own error payload - so neither may be trusted into HTML. The blog
 * makes the same call for the same reason (§5.19: never
 * `dangerouslySetInnerHTML`), and this file is the API's only HTML sink.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
