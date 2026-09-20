import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RateLimit } from '../common/rate-limit/rate-limit.guard.js';
import {
  AUTH_ATTEMPT_LIMIT,
  AUTH_ENUMERATION_LIMIT,
} from '../common/rate-limit/limits.js';
import {
  AuthService,
  AuthResult,
  RegistrationResult,
} from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto.js';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';
import { AnyRole } from './any-role.decorator.js';
import type { JwtPayload } from './jwt.strategy.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // A 409 on a taken email is an account-existence oracle, and signup genuinely
  // needs to report it. Throttling is what stops it being enumerable in bulk.
  @Post('register')
  @Public()
  @RateLimit(AUTH_ENUMERATION_LIMIT)
  async register(@Body() dto: RegisterDto): Promise<RegistrationResult> {
    return this.authService.register(dto.email, dto.password, dto.name);
  }

  @Post('login')
  @Public()
  @RateLimit(AUTH_ATTEMPT_LIMIT)
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @AnyRole()
  @HttpCode(HttpStatus.OK)
  logout(@Request() req: { user: JwtPayload & { exp?: number } }): {
    success: true;
  } {
    return this.authService.logout(req.user);
  }

  // Unauthenticated and it sends mail to an address the caller supplies, so it
  // is both a spam vector and the softest target for probing addresses.
  @Post('password-reset/request')
  @Public()
  @RateLimit(AUTH_ENUMERATION_LIMIT)
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
  ): Promise<{ success: true }> {
    return this.authService.requestPasswordReset(dto.email);
  }

  // The token is a UUID, so guessing is impractical - but an unthrottled
  // endpoint that validates a credential is still a free oracle.
  @Post('password-reset/confirm')
  @Public()
  @RateLimit(AUTH_ATTEMPT_LIMIT)
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
  ): Promise<{ success: true }> {
    return this.authService.confirmPasswordReset(dto.token, dto.newPassword);
  }
}
