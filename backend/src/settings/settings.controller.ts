import { Body, Controller, Get, Patch, Put, Request } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { STAFF_ALL } from '../auth/staff-roles.js';
import { Roles } from '../auth/roles.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { UpdateStaffProfileDto } from './dto/update-staff-profile.dto.js';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto.js';

@Controller('me')
@Roles(...STAFF_ALL)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('profile')
  async getProfile(@Request() req: { user: JwtPayload }) {
    return this.settingsService.getProfile(req.user.sub);
  }

  @Patch('profile')
  async updateProfile(@Request() req: { user: JwtPayload }, @Body() dto: UpdateStaffProfileDto) {
    await this.settingsService.updateProfile(req.user.sub, dto);
    return this.settingsService.getProfile(req.user.sub);
  }

  @Get('notification-preferences')
  async getNotificationPreferences(@Request() req: { user: JwtPayload }) {
    return this.settingsService.getNotificationPreferences(req.user.sub);
  }

  @Put('notification-preferences')
  async updateNotificationPreferences(
    @Request() req: { user: JwtPayload },
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    await this.settingsService.updateNotificationPreferences(req.user.sub, dto);
  }
}
