import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { STUDENT_REPOSITORY } from './interfaces/student-repository.interface.js';
import { InMemoryStudentRepository } from './repositories/in-memory-student.repository.js';

@Module({
  controllers: [StudentsController],
  providers: [
    StudentsService,
    {
      provide: STUDENT_REPOSITORY,
      useClass: InMemoryStudentRepository,
    },
  ],
})
export class StudentsModule {}
