import { IsString, IsOptional, Matches } from 'class-validator';

export class UpdatePushTokenDto {
  @IsString()
  @IsOptional()
  @Matches(/^ExponentPushToken\[.+\]$/, {
    message: 'token must be a valid Expo push token',
  })
  token?: string | null;
}
