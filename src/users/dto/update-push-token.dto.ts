import { IsString, IsOptional, Matches, ValidateIf } from 'class-validator';

export class UpdatePushTokenDto {
  // Allow null to clear the token; only validate the format when a string is provided
  @ValidateIf((o: UpdatePushTokenDto) => o.token !== null)
  @IsOptional()
  @IsString()
  @Matches(/^ExponentPushToken\[[a-zA-Z0-9\-_]+\]$/, {
    message: 'token must be a valid Expo push token (ExponentPushToken[...])',
  })
  token?: string | null;
}
