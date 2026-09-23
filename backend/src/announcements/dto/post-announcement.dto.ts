import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsIn,
} from 'class-validator';
import { AUDIENCE_PATTERN } from '../announcement-audience.js';
import {
  DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
  MAX_ANNOUNCEMENT_PAGE_SIZE,
} from '../announcements.service.js';
import { IsMediaUrl } from '../../common/validators/is-media-url.validator.js';

export class PostCourseAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsIn(['image', 'video', 'youtube', 'file'])
  mediaKind?: 'image' | 'video' | 'youtube' | 'file';

  @IsOptional()
  @IsMediaUrl()
  mediaUrl?: string;
}

export class PatchAnnouncementDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsIn(['image', 'video', 'youtube', 'file'])
  mediaKind?: 'image' | 'video' | 'youtube' | 'file';

  @IsOptional()
  @IsMediaUrl()
  mediaUrl?: string;

  @IsOptional()
  @MaxLength(80)
  @Matches(AUDIENCE_PATTERN, {
    message: 'audience must be all_students, all_tas, course:<courseId>, or group:<groupId>',
  })
  audience?: string;
}

export class PostAnnouncementDto extends PostCourseAnnouncementDto {
  @IsString()
  @MaxLength(80)
  @Matches(AUDIENCE_PATTERN, {
    message: 'audience must be all_students, all_tas, course:<courseId>, or group:<groupId>',
  })
  audience!: string;
}

const toNumber = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

export class ListAnnouncementsQueryDto {
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_ANNOUNCEMENT_PAGE_SIZE)
  limit?: number = DEFAULT_ANNOUNCEMENT_PAGE_SIZE;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}
