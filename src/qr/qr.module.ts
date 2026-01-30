import { Module, Global } from '@nestjs/common';
import { QrService } from './qr.service';

@Global()
@Module({
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}
