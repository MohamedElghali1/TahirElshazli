import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtService } from '@nestjs/jwt';

describe('AuthController', () => {
  let controller: AuthController;
  let _service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            signAsync: vi.fn().mockResolvedValue('mock-token'),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    _service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return an access token on valid login', async () => {
    const result = await controller.login({ email: 'student@example.com', password: 'password123' });
    expect(result).toHaveProperty('accessToken');
    expect(result.accessToken).toBe('mock-token');
  });

  it('should throw on invalid credentials', async () => {
    await expect(
      controller.login({ email: 'wrong@example.com', password: 'wrong' }),
    ).rejects.toThrow();
  });
});
