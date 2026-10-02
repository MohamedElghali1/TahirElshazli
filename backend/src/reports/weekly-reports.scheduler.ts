import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { WeeklyReportsService } from './weekly-reports.service.js';
import { lastCompletedWeekStart } from './week.js';

const HOURLY_MS = 60 * 60 * 1000;

/**
 * Generates the last completed week's drafts at boot and then hourly
 * (`REM-031`, `D-66`). No job framework, no queue (`CLAUDE.md` §5) - a
 * `setInterval` is the whole mechanism, and the repository's upsert guard is
 * what makes re-running it harmless.
 *
 * Off under `NODE_ENV=test`: every e2e file boots the whole `AppModule`
 * (`CLAUDE.md` §10, `OPS-3`), and an hourly timer ticking mid-suite would
 * both race the fixtures each file builds and keep that process alive past
 * its tests.
 *
 * `ponytail:` one replica only - two would each run this on their own timer
 * and both tick, which `upsertDraft`'s guard tolerates (a draft gets written
 * twice, harmlessly) but which is still a race nobody has had to reason
 * about yet. Revisit only with the Redis trigger in `CLAUDE.md` §5 (a second
 * replica being configured).
 */
@Injectable()
export class WeeklyReportsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WeeklyReportsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly weeklyReports: WeeklyReportsService) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), HOURLY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return; // never overlap two runs
    this.running = true;
    try {
      const weekStart = lastCompletedWeekStart(new Date());
      const result = await this.weeklyReports.generateWeek(weekStart);
      this.logger.log(
        `weekly reports generated for ${weekStart}: ` +
          `${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`,
      );
    } catch (error) {
      // Counts only - never a student name, email or mark (CLAUDE.md §8).
      this.logger.error(
        `weekly report generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
