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
  private announcements: Announcement[] = [];

  async create(input: NewAnnouncement): Promise<Announcement> {
    const stored: Announcement = {
      ...input,
      id: randomUUID(),
      audience: encodeAudience({
        type: input.audienceType,
        courseId: input.courseId,
        groupId: input.groupId,
      }),
      createdAt: new Date().toISOString(),
      publishedAt: null,
    };
    this.announcements.unshift(stored);
    return { ...stored };
  }

  async findById(id: string): Promise<Announcement | null> {
    const found = this.announcements.find(a => a.id === id);
    return found ? { ...found } : null;
  }

  async publish(id: string, recipientCount: number): Promise<Announcement | null> {
    const idx = this.announcements.findIndex(a => a.id === id);
    if (idx === -1) return null;
    const row = this.announcements[idx];
    if (row.publishedAt !== null) return null; // already published
    
    this.announcements[idx] = {
      ...row,
      publishedAt: new Date().toISOString(),
      recipientCount,
    };
    return { ...this.announcements[idx] };
  }

  async update(id: string, patch: Partial<Omit<Announcement, 'id' | 'createdAt' | 'publishedAt' | 'recipientCount' | 'audience'>>): Promise<Announcement | null> {
    const idx = this.announcements.findIndex(a => a.id === id);
    if (idx === -1) return null;
    
    const row = this.announcements[idx];
    this.announcements[idx] = { ...row, ...patch };
    
    // Recompute audience if audience fields were patched
    if (patch.audienceType || patch.courseId !== undefined || patch.groupId !== undefined) {
      this.announcements[idx].audience = encodeAudience({
        type: this.announcements[idx].audienceType,
        courseId: this.announcements[idx].courseId,
        groupId: this.announcements[idx].groupId,
      });
    }

    return { ...this.announcements[idx] };
  }

  async remove(id: string): Promise<boolean> {
    const idx = this.announcements.findIndex(a => a.id === id);
    if (idx === -1) return false;
    if (this.announcements[idx].publishedAt !== null) return false;
    
    this.announcements.splice(idx, 1);
    return true;
  }

  private filterByStatus(matches: Announcement[], status?: 'draft' | 'published') {
    if (!status) return matches;
    return matches.filter(a => status === 'draft' ? a.publishedAt === null : a.publishedAt !== null);
  }

  private page(
    matches: Announcement[],
    limit: number,
    offset: number,
  ): Announcement[] {
    return matches
      .slice()
      .sort((a, b) => {
        // Sort by publishedAt if available, else createdAt. Fall back to ID to break ties.
        const aTime = a.publishedAt ?? a.createdAt;
        const bTime = b.publishedAt ?? b.createdAt;
        if (bTime !== aTime) return bTime.localeCompare(aTime);
        return b.id.localeCompare(a.id);
      })
      .slice(offset, offset + limit)
      .map((a) => ({ ...a }));
  }

  async findByGroup(
    groupId: string,
    limit: number,
    offset: number,
    status?: 'draft' | 'published',
  ): Promise<Announcement[]> {
    return this.page(
      this.filterByStatus(this.announcements.filter((a) => a.groupId === groupId), status),
      limit,
      offset,
    );
  }

  async findByCourse(
    courseId: string,
    limit: number,
    offset: number,
    status?: 'draft' | 'published',
  ): Promise<Announcement[]> {
    return this.page(
      this.filterByStatus(this.announcements.filter((a) => a.courseId === courseId), status),
      limit,
      offset,
    );
  }

  async findAll(limit: number, offset: number, status?: 'draft' | 'published'): Promise<Announcement[]> {
    return this.page(this.filterByStatus(this.announcements, status), limit, offset);
  }
}
