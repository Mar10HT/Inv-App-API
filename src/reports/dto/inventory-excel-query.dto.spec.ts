import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { InventoryExcelQueryDto } from './inventory-excel-query.dto';

// The same options as the app's global pipe (src/main.ts)
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const meta: ArgumentMetadata = {
  type: 'query',
  metatype: InventoryExcelQueryDto,
};

describe('InventoryExcelQueryDto', () => {
  it('accepts the language the app sends with every download', async () => {
    await expect(pipe.transform({ locale: 'es' }, meta)).resolves.toMatchObject(
      { locale: 'es' },
    );
  });

  it('accepts it together with the inventory filters', async () => {
    await expect(
      pipe.transform(
        { locale: 'en', status: 'LOW_STOCK', warehouseId: 'w1' },
        meta,
      ),
    ).resolves.toMatchObject({
      locale: 'en',
      status: 'LOW_STOCK',
      warehouseId: 'w1',
    });
  });

  it('refuses a language the reports are not written in', async () => {
    await expect(pipe.transform({ locale: 'fr' }, meta)).rejects.toThrow();
  });

  it('still refuses a parameter nobody declared', async () => {
    await expect(pipe.transform({ nope: '1' }, meta)).rejects.toThrow();
  });
});
