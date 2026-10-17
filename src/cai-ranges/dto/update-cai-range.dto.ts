import { PartialType } from '@nestjs/mapped-types';
import { CreateCaiRangeDto } from './create-cai-range.dto';

export class UpdateCaiRangeDto extends PartialType(CreateCaiRangeDto) {}
