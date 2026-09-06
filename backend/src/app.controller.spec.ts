import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IS_PUBLIC_KEY } from './auth/public.decorator.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('reports the process is up', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok' });
    });

    it('reveals nothing beyond the status', () => {
      // An unauthenticated endpoint that names versions or reports which
      // dependencies are reachable is reconnaissance, so the shape is asserted
      // exactly rather than with toMatchObject.
      expect(Object.keys(appController.getHealth())).toEqual(['status']);
    });

    it('stays reachable without a token', () => {
      // The guards are global and fail-closed; this route only works because
      // it is marked @Public(). Losing that marker would take the container's
      // liveness probe down with it, silently.
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, AppController.prototype.getHealth),
      ).toBe(true);
    });
  });
});
