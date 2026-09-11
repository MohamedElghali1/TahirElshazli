import { Module } from '@nestjs/common';
import { PublicBlogController } from './public-blog.controller.js';
import { StaffBlogController } from './staff-blog.controller.js';
import { BlogService } from './blog.service.js';
import type { BlogRepository } from './interfaces/blog-repository.interface.js';
import { BLOG_REPOSITORY } from './interfaces/blog-repository.interface.js';
import { InMemoryBlogRepository } from './repositories/in-memory-blog.repository.js';
import { PostgresBlogRepository } from './repositories/postgres-blog.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';

/**
 * The blog: Dr. Tahir's achievements, authored by staff and read by students
 * and visitors alike (CLAUDE.md §5.19).
 *
 * It provides exactly one repository - its own. `USER_REPOSITORY` arrives from
 * `AuthModule`, which also supplies the `PassportModule` the global guards
 * need; re-providing it here would build a second `InMemoryUserRepository` and
 * every byline would resolve against an account list nobody else can see.
 *
 * **No `StaffModule` import, and that absence is deliberate.** Every other
 * staff-facing module pulls in `StaffScopeService` because its routes name a
 * course. A blog post names none, so there is nothing to scope by and no join
 * to make - authorship stands in for it inside `BlogService` (§5.19).
 *
 * `AuditService` arrives via the global `AuditModule`, and `DatabaseService`
 * via the global `DatabaseModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [StaffBlogController, PublicBlogController],
  providers: [
    BlogService,
    InMemoryBlogRepository,
    PostgresBlogRepository,
    repositoryProvider<BlogRepository>(
      BLOG_REPOSITORY,
      InMemoryBlogRepository,
      PostgresBlogRepository,
    ),
  ],
  exports: [BlogService],
})
export class BlogModule {}
