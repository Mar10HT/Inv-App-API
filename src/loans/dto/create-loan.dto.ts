import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/** Validates that a date string represents a date in the future. */
function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          return new Date(value) > new Date();
        },
        defaultMessage: () => `${propertyName} must be a date in the future`,
      },
    });
  };
}

export class CreateLoanDto {
  @IsString()
  @IsNotEmpty()
  inventoryItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  sourceWarehouseId: string;

  @IsString()
  @IsNotEmpty()
  destinationWarehouseId: string;

  @IsDateString()
  @IsNotEmpty()
  @IsFutureDate({ message: 'Due date must be a date in the future' })
  dueDate: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
