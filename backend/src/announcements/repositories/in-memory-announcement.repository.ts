import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { encodeAudience } from '../announcement-audience.js';
import type {
  Announcement,
  AnnouncementRepository,
  NewAnnouncement,
} from '../interfaces/announcement-repository.interface.js';

/**
 * Process-local and unbounded, like every other `InMemory*Repository` here.
 *
 * Starts empty rather than with fixtures. An announcement is a message someone
 * sent to real people; seeding two of them would put words in Dr. Tahir's
 * mouth in every developer's console - the same argument the audit log makes
 * for starting empty.
 */
@Injectable()
export class InMemoryAnnouncementRepository implements AnnouncementRepository {
  /** Newest first, matching the order both read methods return. */
  private readonly announcements: Announcement[] = [];

  async create(input: NewAnnouncement): Promise<Announcement> {
    const stored: Announcement = {
      ...input,
      id: randomUUID(),
      audience: encodeAudience({
        type: input.audienceType,
        courseId: input.courseId,
      }),
      postedAt: new Date().toISOString(),
    };
    this.announcements.unshift(stored);
    // A copy, so the caller cannot mutate the stored row through the return
    // value - the defect that made a grading audit entry's before and after
    // the same object.
    return { ...stored };
  }

  private page(
    matches: Announcement[],
    limit: number,
    offset: number,
  ): Announcement[] {
    return matches
      .slice()
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
      .slice(offset, offset + limit)
      .map((a) => ({ ...a }));
  }

  async findByCourse(
    courseId: string,
    limit: number,
    offset: number,
  ): Promise<Announcement[]> {
    return this.page(
      this.announcements.filter((a) => a.courseId === courseId),
      limit,
      offset,
    );
  }

  async findAll(limit: number, offset: number): Promise<Announcement[]> {
    return this.page(this.announcements, limit, offset);
  }
}
