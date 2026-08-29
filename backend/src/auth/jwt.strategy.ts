import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_SECRET } from './constants.js';
import { TokenDenylistService } from './token-denylist.service.js';
import type { UserRepository } from './interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from './interfaces/user-repository.interface.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  jti: string;
  /** Standard issued-at, in whole seconds. Added by the signer. */
  iat?: number;
  /** Mint time in milliseconds - what the per-user revocation cutoff compares. */
  iatMs?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly denylist: TokenDenylistService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.jti && this.denylist.isRevoked(payload.jti)) {
      throw new UnauthorizedException('Session has been logged out');
    }
    if (this.denylist.isIssuedBeforeCutoff(payload.sub, payload.iatMs)) {
      throw new UnauthorizedException(
        'Session ended because the password was changed',
      );
    }
    // The role travels in the token but is authoritative only in the database:
    // without this, a deleted or demoted user keeps their old access until the
    // token expires. RolesGuard reads what we return here.
    const user = await this.userRepo.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    return { ...payload, email: user.email, role: user.role };
  }
}
