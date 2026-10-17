import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateSaleDto } from './create-sale.dto';

// Only a DRAFT can be edited (enforced in SalesService.update); asDraft is
// omitted since status transitions happen via confirm()/cancel(), never a
// field in the edit body.
export class UpdateSaleDto extends PartialType(
  OmitType(CreateSaleDto, ['asDraft'] as const),
) {}
