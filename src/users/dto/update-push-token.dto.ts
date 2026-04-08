import { IsDefined, IsString, Matches, ValidateIf } from 'class-validator';

export class UpdatePushTokenDto {
  // Required field: pass a valid Expo token to register, or null to clear.
  // Omitting the field entirely is rejected — use null to explicitly unregister.
  // @IsDefined rejects undefined while still allowing null.
  @IsDefined({ message: 'token is required' })
  @ValidateIf((o: UpdatePushTokenDto) => o.token !== null)
  @IsString()
  @Matches(/^ExponentPushToken\[[a-zA-Z0-9\-_]+\]$/, {
    message: 'token must be a valid Expo push token (ExponentPushToken[...])',
  })
  token: string | null;
}
