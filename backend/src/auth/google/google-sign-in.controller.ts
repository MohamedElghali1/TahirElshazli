import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import { Public } from '../public.decorator.js';
import { Roles } from '../roles.decorator.js';
import { Role } from '../roles.enum.js';
import { STAFF_ALL } from '../staff-roles.js';
import type { JwtPayload } from '../jwt.strategy.js';
import type { AuthResult } from '../auth.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { AUTH_ATTEMPT_LIMIT, OAUTH_CALLBACK_LIMIT } from '../../common/rate-limit/limits.js';
import { CompleteGoogleDto } from './dto/complete-google.dto.js';
import {
  GoogleSignInService,
  type GoogleLinkStatus,
  type GoogleStart,
} from './google-sign-in.service.js';

/** Everyone with an account of their own. Not `parent` or `visitor`: neither signs in. */
const ACCOUNT_HOLDERS = [Role.Student, ...STAFF_ALL];

/**
 * `/auth/google/*` - Google sign-in (`GAUTH-1`). Decorated **per method**,
 * like `AuthController`: two routes are anonymous by necessity (someone
 * signing in has no session yet) and four act on the caller's own account.
 *
 * The anonymous two are gated by what `GoogleSignInService` verifies instead
 * of a session - a signed state of the right purpose, the starting browser's
 * key, and a verified `id_token` - and neither can create an account (`D-50`)
 * or a link (`D-49`).
 */
@Controller('auth/google')
export class GoogleSignInController {
  constructor(private readonly google: GoogleSignInService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  @Post('start')
  @Public()
  @RateLimit(OAUTH_CALLBACK_LIMIT)
  @HttpCode(HttpStatus.OK)
  start(): Promise<GoogleStart> {
    return this.google.startSignIn();
  }

  // Mints a session, so it is throttled like login.
  @Post('sign-in')
  @Public()
  @RateLimit(AUTH_ATTEMPT_LIMIT)
  @HttpCode(HttpStatus.OK)
  signIn(@Body() dto: CompleteGoogleDto): Promise<AuthResult> {
    return this.google.signIn(dto.code, dto.state, dto.browserKey);
  }

  @Get('link')
  @Roles(...ACCOUNT_HOLDERS)
  status(@Request() req: { user: JwtPayload }): Promise<GoogleLinkStatus> {
    return this.google.status(this.actor(req));
  }

  @Post('link/start')
  @Roles(...ACCOUNT_HOLDERS)
  @RateLimit(OAUTH_CALLBACK_LIMIT)
  @HttpCode(HttpStatus.OK)
  startLink(@Request() req: { user: JwtPayload }): Promise<GoogleStart> {
    return this.google.startLink(this.actor(req));
  }

  @Post('link')
  @Roles(...ACCOUNT_HOLDERS)
  @RateLimit(AUTH_ATTEMPT_LIMIT)
  @HttpCode(HttpStatus.OK)
  link(@Request() req: { user: JwtPayload }, @Body() dto: CompleteGoogleDto): Promise<GoogleLinkStatus> {
    return this.google.link(this.actor(req), dto.code, dto.state, dto.browserKey);
  }

  @Delete('link')
  @Roles(...ACCOUNT_HOLDERS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@Request() req: { user: JwtPayload }): Promise<void> {
    await this.google.unlink(this.actor(req));
  }
}
