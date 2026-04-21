import { IsString, Length, Matches } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 10)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'slug must contain only uppercase letters and digits',
  })
  slug!: string;

  @IsString()
  @Length(2, 120)
  name!: string;
}
