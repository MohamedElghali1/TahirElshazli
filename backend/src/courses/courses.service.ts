import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type {
  CourseRepository,
  CourseListItem,
  CourseDetail,
} from './interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';

@Injectable()
export class CoursesService {
  constructor(
    @Inject(COURSE_REPOSITORY)
    private readonly courseRepo: CourseRepository,
  ) {}

  async getEnrolledCourses(studentId: string): Promise<CourseListItem[]> {
    return this.courseRepo.findEnrolledCourses(studentId);
  }

  async getCourseDetail(courseId: string, studentId: string): Promise<CourseDetail> {
    const detail = await this.courseRepo.findCourseDetail(courseId, studentId);
    if (!detail) {
      throw new NotFoundException('Course not found or student not enrolled');
    }
    return detail;
  }
}
