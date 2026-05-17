import { Module } from '@nestjs/common';
import { PdfReceiptsService } from './pdf-receipts.service';

@Module({
  providers: [PdfReceiptsService],
  exports: [PdfReceiptsService],
})
export class PdfReceiptsModule {}
