import { Module } from '@nestjs/common';
import { STUDENT_REPOSITORY } from './interfaces/student-repository.interface.js';
import { InMemoryStudentRepository } from './repositories/in-memory-student.repository.js';

/**
 * Holds the student repository on its own so both AuthModule (which creates a
 * profile at registration) and StudentsModule can inject the *same* instance.
 * Providing it in each of them separately would give each module its own copy
 * of the in-memory store; importing StudentsModule from AuthModule would be a
 * cycle, since StudentsModule already imports AuthModule for the guards.
 */
@Module({
  providers: [
    {
      provide: STUDENT_REPOSITORY,
      useClass: InMemoryStudentRepository,
    },
  ],
  exports: [STUDENT_REPOSITORY],
})
export class StudentRepositoryModule {}
