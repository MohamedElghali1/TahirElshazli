import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { StudentsModule } from './students/students.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { RecordingsModule } from './recordings/recordings.module.js';
import { MaterialsModule } from './materials/materials.module.js';
import { AssessmentsModule } from './assessments/assessments.module.js';

@Module({
  imports: [
    AuthModule,
    StudentsModule,
    CoursesModule,
    RecordingsModule,
    MaterialsModule,
    AssessmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
