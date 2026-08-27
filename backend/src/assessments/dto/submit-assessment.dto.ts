import { IsOptional, IsString, IsUrl } from 'class-validator';

export class SubmitAssessmentDto {
  @IsOptional()
  @IsString()
  @IsUrl()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  answerText?: string;
}
