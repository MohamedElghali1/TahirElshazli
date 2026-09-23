import { Body, Controller, Get, Patch, Put, Req } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { STAFF_ALL } from '../auth/staff-roles.js';
import { Roles } from '../auth/roles.decorator.js';
import { Request } from 'express';
import { UpdateStaffProfileDto } from './dto/update-staff-profile.dto.js';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto.js';

@Controller('me')
@Roles(...STAFF_ALL)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('profile')
  async getProfile(@Req() req: Request) {
    return this.settingsService.getProfile(req.user.sub);
  }

  @Patch('profile')
  async updateProfile(@Req() req: Request, @Body() dto: UpdateStaffProfileDto) {
    await this.settingsService.updateProfile(req.user.sub, dto);
    return this.settingsService.getProfile(req.user.sub);
  }

  @Get('notification-preferences')
  async getNotificationPreferences(@Req() req: Request) {
    return this.settingsService.getNotificationPreferences(req.user.sub);
  }

  @Put('notification-preferences')
  async updateNotificationPreferences(
    @Req() req: Request,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    await this.settingsService.updateNotificationPreferences(req.user.sub, dto);
  }
}
