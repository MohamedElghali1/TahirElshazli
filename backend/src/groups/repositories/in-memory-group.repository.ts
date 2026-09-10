import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  Group,
  GroupCourse,
  GroupMembership,
  GroupRepository,
  NewGroup,
  NewGroupCourse,
  NewGroupMembership,
} from '../interfaces/group-repository.interface.js';

/**
 * Seeded, unlike the announcement and audit repositories which start empty.
 *
 * The difference is what the rows mean. A seeded announcement puts words in Dr.
 * Tahir's mouth; a seeded group is furniture - it is the fixture that makes the
 * student surface show anything at all, because after 2026-09-10 an unplaced
 * student's course is empty by design (CLAUDE.md §5.16). A dev database with
 * enrollments and no groups would look broken rather than empty.
 *
 * `student-1` is in group-1 (course-1, recorded) and group-2 (course-2, live),
 * which mirrors the two enrollments in `InMemoryEnrollmentRepository` and gives
 * the classmate list (§5.17) something to return. `student-2` shares group-1
 * with them and is that something.
 */
const SEED_GROUPS: readonly Group[] = [
  {
    id: 'group-1',
    name: 'IGCSE Chemistry — Saturday 18:00',
    teacherId: 'teacher-1',
    createdAt: '2026-01-15T09:00:00Z',
  },
  {
    id: 'group-2',
    name: 'IGCSE Chemistry — Tuesday 20:00',
    teacherId: 'teacher-1',
    createdAt: '2026-05-20T09:00:00Z',
  },
];

const SEED_GROUP_COURSES: readonly GroupCourse[] = [
  {
    id: 'group-course-1',
    groupId: 'group-1',
    courseId: 'course-1',
    learningMode: 'recorded',
    enrolledAt: '2026-01-15T09:00:00Z',
    enrolledBy: 'teacher-1',
  },
  {
    id: 'group-course-2',
    groupId: 'group-2',
    courseId: 'course-2',
    learningMode: 'live',
    enrolledAt: '2026-05-20T09:00:00Z',
    enrolledBy: 'teacher-1',
  },
];

const SEED_MEMBERSHIPS: readonly GroupMembership[] = [
  {
    id: 'group-membership-1',
    groupId: 'group-1',
    studentId: 'student-1',
    assignedBy: 'teacher-1',
    assignedAt: '2026-01-20T09:00:00Z',
  },
  {
    id: 'group-membership-2',
    groupId: 'group-1',
    studentId: 'student-2',
    assignedBy: 'assistant-1',
    assignedAt: '2026-03-15T09:00:00Z',
  },
  {
    id: 'group-membership-3',
    groupId: 'group-2',
    studentId: 'student-1',
    assignedBy: 'teacher-1',
    assignedAt: '2026-06-01T09:00:00Z',
  },
];

@Injectable()
export class InMemoryGroupRepository implements GroupRepository {
  /**
   * Per-instance copies of the seeds. A test that places a student must not
   * leak that placement into the next test, which a shared module-level array
   * would - the same reasoning as `InMemoryEnrollmentRepository`.
   */
  private readonly groups: Group[] = [...SEED_GROUPS];
  private readonly groupCourses: GroupCourse[] = [...SEED_GROUP_COURSES];
  private readonly memberships: GroupMembership[] = [...SEED_MEMBERSHIPS];

  async findById(groupId: string): Promise<Group | null> {
    const found = this.groups.find((g) => g.id === groupId);
    // A copy. A caller that takes this as a `before` snapshot and then calls
    // `rename` would otherwise watch its own snapshot change underneath it -
    // the aliasing defect CLAUDE.md §7.1 records finding twice.
    return found ? { ...found } : null;
  }

  async findAll(limit: number, offset: number): Promise<Group[]> {
    return this.sorted().slice(offset, offset + limit);
  }

  async findByIds(groupIds: readonly string[]): Promise<Group[]> {
    const wanted = new Set(groupIds);
    return this.groups.filter((g) => wanted.has(g.id)).map((g) => ({ ...g }));
  }

  private sorted(): Group[] {
    return this.groups
      .slice()
      .sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )
      .map((g) => ({ ...g }));
  }

  async create(input: NewGroup): Promise<Group> {
    const stored: Group = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.groups.push(stored);
    return { ...stored };
  }

  async rename(groupId: string, name: string): Promise<Group | null> {
    const found = this.groups.find((g) => g.id === groupId);
    if (!found) {
      return null;
    }
    found.name = name;
    return { ...found };
  }

  async addCourse(input: NewGroupCourse): Promise<GroupCourse> {
    const existing = this.groupCourses.find(
      (gc) => gc.groupId === input.groupId && gc.courseId === input.courseId,
    );
    if (existing) {
      return { ...existing };
    }
    const stored: GroupCourse = {
      ...input,
      id: randomUUID(),
      enrolledAt: new Date().toISOString(),
    };
    this.groupCourses.push(stored);
    return { ...stored };
  }

  async removeCourse(groupId: string, courseId: string): Promise<boolean> {
    const index = this.groupCourses.findIndex(
      (gc) => gc.groupId === groupId && gc.courseId === courseId,
    );
    if (index === -1) {
      return false;
    }
    this.groupCourses.splice(index, 1);
    return true;
  }

  async findCourses(groupId: string): Promise<GroupCourse[]> {
    return this.groupCourses
      .filter((gc) => gc.groupId === groupId)
      .map((gc) => ({ ...gc }));
  }

  async findGroupCoursesByCourse(courseId: string): Promise<GroupCourse[]> {
    return this.groupCourses
      .filter((gc) => gc.courseId === courseId)
      .map((gc) => ({ ...gc }));
  }

  async addMember(input: NewGroupMembership): Promise<GroupMembership> {
    const existing = this.memberships.find(
      (m) => m.groupId === input.groupId && m.studentId === input.studentId,
    );
    if (existing) {
      return { ...existing };
    }
    const stored: GroupMembership = {
      ...input,
      id: randomUUID(),
      assignedAt: new Date().toISOString(),
    };
    this.memberships.push(stored);
    return { ...stored };
  }

  async removeMember(groupId: string, studentId: string): Promise<boolean> {
    const index = this.memberships.findIndex(
      (m) => m.groupId === groupId && m.studentId === studentId,
    );
    if (index === -1) {
      return false;
    }
    this.memberships.splice(index, 1);
    return true;
  }

  async findMembers(groupId: string): Promise<GroupMembership[]> {
    return this.memberships
      .filter((m) => m.groupId === groupId)
      .map((m) => ({ ...m }));
  }

  async findMembershipsForStudent(
    studentId: string,
  ): Promise<GroupMembership[]> {
    return this.memberships
      .filter((m) => m.studentId === studentId)
      .map((m) => ({ ...m }));
  }

  async findStudentGroupCourses(
    studentId: string,
    courseId: string,
  ): Promise<GroupCourse[]> {
    const groupIds = new Set(
      this.memberships
        .filter((m) => m.studentId === studentId)
        .map((m) => m.groupId),
    );
    return this.groupCourses
      .filter((gc) => gc.courseId === courseId && groupIds.has(gc.groupId))
      .map((gc) => ({ ...gc }));
  }

  async countMembersByGroups(
    groupIds: readonly string[],
  ): Promise<Record<string, number>> {
    const wanted = new Set(groupIds);
    const counts: Record<string, number> = {};
    for (const membership of this.memberships) {
      if (wanted.has(membership.groupId)) {
        counts[membership.groupId] = (counts[membership.groupId] ?? 0) + 1;
      }
    }
    return counts;
  }
}
