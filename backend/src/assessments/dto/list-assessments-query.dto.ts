import { IsIn, IsOptional } from 'class-validator';
import type { AssessmentType } from '../interfaces/assessment-repository.interface.js';

const ASSESSMENT_TYPES: AssessmentType[] = ['homework', 'assignment', 'quiz'];

export class ListAssessmentsQueryDto {
  @IsOptional()
  @IsIn(ASSESSMENT_TYPES)
  type?: AssessmentType;
}
