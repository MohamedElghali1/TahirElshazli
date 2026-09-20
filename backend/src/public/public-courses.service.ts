import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CourseRepository,
  StoredCourse,
} from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';

/**
 * One lesson as a *visitor* sees it: a title, a position and a running time.
 *
 * Deliberately not the stored `Lesson`. The shapes happen to match today, and
 * mapping between two identical types looks like waste right up until someone
 * adds `videoAssetId` or `bunnyLibraryId` to storage - at which point a
 * structural reuse would have published it to the open internet without a
 * single line changing in this file. The mapping below is the boundary.
 */
export interface PublicOutlineLesson {
  id: string;
  title: string;
  order: number;
  durationSeconds: number;
}

export interface PublicOutlineModule {
  id: string;
  title: string;
  chapter: string;
  order: number;
  lessons: PublicOutlineLesson[];
}

export interface PublicCourseSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  moduleCount: number;
  lessonCount: number;
  totalDurationSeconds: number;
}

/**
 * The course page a visitor lands on. Carries the whole outline - every module,
 * every lesson title - because the syllabus is the argument for enrolling, and
 * a catalog that hides it asks people to buy blind.
 *
 * What it does NOT carry is the content behind those titles: no video ids, no
 * material URLs, no assessment bodies. CLAUDE.md §7.2 drew this line for the
 * student catalog ("counting lessons is not reading them"); this extends it one
 * step - naming lessons is not reading them either - and stops there. Every
 * read of actual content still goes through `assertEnrolled`.
 */
export interface PublicCourseDetail extends PublicCourseSummary {
  modules: PublicOutlineModule[];
}

/**
 * Same cap and same reasoning as the student catalog (§7.2): the catalog is
 * small and edited rarely, so one page is the whole thing - and when that stops
 * being true it truncates visibly rather than serving an unbounded list to
 * anonymous callers.
 */
const PUBLIC_PAGE_SIZE = 100;

@Injectable()
export class PublicCoursesService {
  constructor(
    @Inject(COURSE_REPOSITORY)
    private readonly courseRepo: CourseRepository,
  ) {}

  async listCourses(): Promise<PublicCourseSummary[]> {
    const courses = await this.courseRepo.findPublished(PUBLIC_PAGE_SIZE, 0);
    return courses.map((course) => this.toSummary(course));
  }

  /**
   * An unpublished course answers 404, not 403 - the same choice
   * `StaffScopeService.assertAssigned` makes for an unassigned course and the
   * student surface makes for an unenrolled one (CLAUDE.md §5.11). A 403 would
   * confirm the slug exists, which is exactly what someone probing for an
   * unannounced course wants to learn.
   */
  async getCourseBySlug(slug: string): Promise<PublicCourseDetail> {
    const course = await this.courseRepo.findBySlug(slug);
    if (!course || !course.isPublished) {
      throw new NotFoundException('Course not found');
    }
    return {
      ...this.toSummary(course),
      modules: course.modules.map((module) => ({
        id: module.id,
        title: module.title,
        chapter: module.chapter,
        order: module.order,
        lessons: module.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          order: lesson.order,
          durationSeconds: lesson.durationSeconds,
        })),
      })),
    };
  }

  private toSummary(course: StoredCourse): PublicCourseSummary {
    const lessons = course.modules.flatMap((module) => module.lessons);
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      teacherName: course.teacherName,
      moduleCount: course.modules.length,
      lessonCount: lessons.length,
      totalDurationSeconds: lessons.reduce(
        (total, lesson) => total + lesson.durationSeconds,
        0,
      ),
    };
  }
}
