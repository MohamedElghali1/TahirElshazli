import { IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  submissions!: boolean;

  @IsBoolean()
  registrations!: boolean;

  @IsBoolean()
  unmatched!: boolean;

  @IsBoolean()
  weeklySummary!: boolean;
}
