import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PasswordHasher } from './interfaces/password-hasher.interface.js';

const SALT_ROUNDS = 10;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
