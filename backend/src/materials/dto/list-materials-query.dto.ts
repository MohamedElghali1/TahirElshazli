import { IsIn, IsOptional } from 'class-validator';
import {
  MATERIAL_CATEGORIES,
  type MaterialCategory,
} from '../interfaces/material-repository.interface.js';

export class ListMaterialsQueryDto {
  @IsOptional()
  @IsIn(MATERIAL_CATEGORIES)
  category?: MaterialCategory;
}
