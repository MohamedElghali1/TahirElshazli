import { Module, Logger } from '@nestjs/common';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { LocalDiskStorage } from './local-disk-storage.service.js';
import { R2Storage } from './r2-storage.service.js';
import { FileUrls } from './file-urls.service.js';
import { FILE_STORAGE } from './file-storage.interface.js';
import { AuthModule } from '../../auth/auth.module.js';
import { resolveNodeEnv, resolveR2Config, resolveStorageDriver } from '../config/env.js';

/**
 * File storage and the one endpoint that writes to it.
 *
 * `FILE_STORAGE` resolves to **null** when no driver is configured, which is
 * the production default (`STORAGE_DRIVER=none`). That is a deliberate shape
 * rather than an oversight: `UploadsService` answers 503 with a message the UI
 * can render, so the platform stays fully usable through the URL field while
 * Cloudflare R2 is unprovisioned (CLAUDE.md §3 - the subscriptions are the
 * client's and the code degrades sensibly without them).
 *
 * The driver is read once at wiring time, matching `repositoryProvider`. What
 * is running should not be able to change underneath a live request.
 */
@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    LocalDiskStorage,
    FileUrls,
    {
      provide: FILE_STORAGE,
      inject: [LocalDiskStorage],
      useFactory: (local: LocalDiskStorage) => {
        const nodeEnv = resolveNodeEnv();
        const driver = resolveStorageDriver(nodeEnv);
        if (driver === 'local') {
          new Logger('StorageModule').warn(
            `STORAGE_DRIVER=local: uploads are written to ${local.directory} ` +
              'and are lost when this container is replaced.',
          );
          return local;
        }
        if (driver === 'r2') {
          // Boot fails here, listing whatever is missing, rather than on the
          // first upload - the same shape as every other `resolve*Config`.
          const config = resolveR2Config(driver);
          return new R2Storage(config!);
        }
        return null;
      },
    },
  ],
  exports: [UploadsService, FileUrls],
})
export class StorageModule {}
