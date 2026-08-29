import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { MaterialsService, MaterialsByCategory } from './materials.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { ListMaterialsQueryDto } from './dto/list-materials-query.dto.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get('courses/:id/materials')
  async listMaterials(
    @Param('id') courseId: string,
    @Query() query: ListMaterialsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<MaterialsByCategory> {
    return this.materialsService.getMaterialsForCourse(
      courseId,
      req.user.sub,
      query.category,
    );
  }
}
