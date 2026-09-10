import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ReportDocument,
  ReportRepository,
} from './interfaces/report-repository.interface.js';
import { REPORT_REPOSITORY } from './interfaces/report-repository.interface.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import type { AssessmentPerformanceEntry } from '../assessments/assessments.service.js';
import { CoursesService } from '../courses/courses.service.js';
import type { CourseProgress } from '../courses/courses.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';

/** At or above this percentage a topic counts as a strong area. */
const STRONG_AREA_THRESHOLD = 75;

export interface TopicScore {
  topic: string;
  percentage: number;
  gradedCount: number;
}

export interface PerformanceSnapshot {
  quizAverage: number | null;
  assignmentAverage: number | null;
  /**
   * A submission *rate*, not a grade — the share of homework handed in at all.
   * Named explicitly because it is the one completion figure living in this
   * struct, and §5.1 is a direct client correction: progress and performance
   * must never collapse into one number. It is deliberately excluded from
   * `overallPercentage`, which averages graded scores only.
   */
  homeworkSubmissionRate: number;
  overallPercentage: number | null;
  gradedCount: number;
}

/**
 * Progress and performance are returned as two separate blocks and are never
 * averaged together: progress is course completion, performance is grades.
 */
export interface ReportSummary {
  courseId: string;
  progress: CourseProgress;
  performance: PerformanceSnapshot;
  strongAreas: TopicScore[];
  needsImprovement: TopicScore[];
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORT_REPOSITORY)
    private readonly reportRepo: ReportRepository,
    private readonly assessmentsService: AssessmentsService,
    private readonly coursesService: CoursesService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  private averagePercentage(
    entries: readonly AssessmentPerformanceEntry[],
  ): number | null {
    const graded = entries.filter(
      (e): e is AssessmentPerformanceEntry & { score: number } =>
        e.score !== null && e.maxScore > 0,
    );
    if (graded.length === 0) {
      return null;
    }
    const total = graded.reduce((sum, e) => sum + e.score / e.maxScore, 0);
    return Math.round((total / graded.length) * 1000) / 10;
  }

  private topicScores(entries: AssessmentPerformanceEntry[]): TopicScore[] {
    const byTopic = new Map<string, AssessmentPerformanceEntry[]>();
    for (const entry of entries) {
      if (entry.score === null) continue;
      for (const topic of entry.topics) {
        const bucket = byTopic.get(topic);
        if (bucket) {
          bucket.push(entry);
        } else {
          byTopic.set(topic, [entry]);
        }
      }
    }
    return [...byTopic.entries()]
      .map(([topic, topicEntries]) => ({
        topic,
        percentage: this.averagePercentage(topicEntries) ?? 0,
        gradedCount: topicEntries.length,
      }))
      // Tie-break by topic name so equal percentages order deterministically
      // instead of falling back on whatever order the grades happened to load in.
      .sort(
        (a, b) =>
          b.percentage - a.percentage || a.topic.localeCompare(b.topic),
      );
  }

  /**
   * The performance block, and only it.
   *
   * The one arithmetic implementation - `getSummary` builds its own block from
   * this same method, so the average a student reads on the Home screen and the
   * one on the Report screen are the same number by construction rather than by
   * two call sites agreeing. §5.1 keeps progress out of it: nothing here reads
   * completion.
   */
  private buildPerformance(
    entries: readonly AssessmentPerformanceEntry[],
  ): PerformanceSnapshot {
    const homework = entries.filter((e) => e.type === 'homework');
    const homeworkDone = homework.filter(
      (e) => e.status === 'submitted' || e.status === 'corrected',
    ).length;

    return {
      quizAverage: this.averagePercentage(
        entries.filter((e) => e.type === 'quiz'),
      ),
      assignmentAverage: this.averagePercentage(
        entries.filter((e) => e.type === 'assignment'),
      ),
      homeworkSubmissionRate:
        homework.length === 0
          ? 0
          : Math.round((homeworkDone / homework.length) * 100),
      overallPercentage: this.averagePercentage(entries),
      gradedCount: entries.filter((e) => e.score !== null).length,
    };
  }

  /**
   * Internal: performance without the progress block, for a caller that has
   * already asserted enrollment and already holds the course's progress.
   *
   * Same precedent as `LiveSessionsService.getAttendanceSummary` - the caller
   * owns the enrollment check. `DashboardService` uses this instead of
   * `getSummary`, which would re-assert the enrollment and recompute a
   * `CourseProgress` the dashboard has already built, for one number.
   */
  async getPerformanceFor(
    courseId: string,
    studentId: string,
  ): Promise<PerformanceSnapshot> {
    const entries = await this.assessmentsService.getPerformanceEntries(
      courseId,
      studentId,
    );
    return this.buildPerformance(entries);
  }

  async getSummary(courseId: string, studentId: string): Promise<ReportSummary> {
    const enrollment = await this.enrollmentsService.assertEnrolled(
      courseId,
      studentId,
    );
    const [progress, entries] = await Promise.all([
      this.coursesService.getProgress(courseId, studentId, enrollment.learningMode),
      this.assessmentsService.getPerformanceEntries(courseId, studentId),
    ]);

    const topics = this.topicScores(entries);

    return {
      courseId,
      progress,
      performance: this.buildPerformance(entries),
      strongAreas: topics.filter((t) => t.percentage >= STRONG_AREA_THRESHOLD),
      // Weakest first - this list is a to-do, so the worst topic leads.
      needsImprovement: topics
        .filter((t) => t.percentage < STRONG_AREA_THRESHOLD)
        .sort(
          (a, b) =>
            a.percentage - b.percentage || a.topic.localeCompare(b.topic),
        ),
    };
  }

  async getDocuments(
    courseId: string,
    studentId: string,
  ): Promise<ReportDocument[]> {
    await this.enrollmentsService.assertEnrolled(courseId, studentId);
    return this.reportRepo.findDocuments(courseId, studentId);
  }

  async getDocument(
    documentId: string,
    studentId: string,
  ): Promise<ReportDocument> {
    const document = await this.reportRepo.findDocumentById(documentId);
    // 404 rather than 403 when the report belongs to someone else: a 403 would
    // confirm the id exists, which is enough to enumerate other students'
    // reports. Same reasoning as EnrollmentsService.assertEnrolled.
    if (!document || document.studentId !== studentId) {
      throw new NotFoundException('Report document not found');
    }
    // The report is the student's own, but the course it covers still has to be
    // one they hold - an enrollment can be revoked after a report is generated.
    await this.enrollmentsService.assertEnrolled(document.courseId, studentId);
    return document;
  }
}
