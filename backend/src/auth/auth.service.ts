import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from './roles.enum.js';

interface StoredUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  name: string;
}

const STUB_USERS: StoredUser[] = [
  {
    id: 'student-1',
    email: 'student@example.com',
    password: 'password123',
    role: Role.Student,
    name: 'Ahmed Hassan',
  },
  {
    id: 'student-2',
    email: 'student2@example.com',
    password: 'password123',
    role: Role.Student,
    name: 'Sara Ahmed',
  },
  {
    id: 'teacher-1',
    email: 'teacher@example.com',
    password: 'password123',
    role: Role.Teacher,
    name: 'Dr. Tahir Elshazli',
  },
];

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = STUB_USERS.find((u) => u.email === email);
    if (!user || user.password !== password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }
}
