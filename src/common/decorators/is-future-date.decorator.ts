import { registerDecorator, ValidationOptions } from 'class-validator';

/** Validates that a date string represents a date in the future (UTC comparison). */
export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          return new Date(value) > new Date();
        },
        defaultMessage: () => `${propertyName} must be a date in the future`,
      },
    });
  };
}
