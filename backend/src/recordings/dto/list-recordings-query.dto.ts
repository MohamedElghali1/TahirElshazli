import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListRecordingsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  chapter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  topic?: string;
}
