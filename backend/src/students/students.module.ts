import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { StudentRepositoryModule } from './student-repository.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule, StudentRepositoryModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
