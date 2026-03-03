import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FilterInventoryDto } from '../inventory/dto/filter-inventory.dto';
import { warehouseFilter, warehouseFilterMultiField } from '../common/warehouse-access/warehouse-filter.util';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async generateInventoryExcel(filters?: FilterInventoryDto, warehouseIds?: string[] | null): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventario');

    // Build where clause
    const where: any = { deletedAt: null, ...warehouseFilter(warehouseIds) };
    if (filters?.category) where.category = filters.category;
    if (filters?.status) where.status = filters.status;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const items = await this.prisma.inventoryItem.findMany({
      where,
      include: {
        warehouse: true,
        supplier: true,
      },
      orderBy: { name: 'asc' },
    });

    // Define columns
    worksheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Descripcion', key: 'description', width: 40 },
      { header: 'Categoria', key: 'category', width: 20 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Cantidad Minima', key: 'minQuantity', width: 15 },
      { header: 'Estado', key: 'status', width: 15 },
      { header: 'Precio', key: 'price', width: 12 },
      { header: 'Moneda', key: 'currency', width: 10 },
      { header: 'Almacen', key: 'warehouse', width: 20 },
      { header: 'Proveedor', key: 'supplier', width: 20 },
      { header: 'Tipo', key: 'itemType', width: 10 },
      { header: 'Service Tag', key: 'serviceTag', width: 20 },
      { header: 'Numero Serie', key: 'serialNumber', width: 20 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data rows
    items.forEach(item => {
      worksheet.addRow({
        sku: item.sku || '',
        name: item.name,
        description: item.description || '',
        category: item.category,
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        status: item.status,
        price: item.price || 0,
        currency: item.currency,
        warehouse: item.warehouse?.name || '',
        supplier: item.supplier?.name || '',
        itemType: item.itemType,
        serviceTag: item.serviceTag || '',
        serialNumber: item.serialNumber || '',
      });
    });

    // Add summary at the end
    worksheet.addRow({});
    worksheet.addRow({ name: 'Total Items:', quantity: items.length });
    worksheet.addRow({
      name: 'Valor Total:',
      price: items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0),
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateInventoryPdf(filters?: FilterInventoryDto, warehouseIds?: string[] | null): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;

    // Build where clause
    const where: any = { deletedAt: null, ...warehouseFilter(warehouseIds) };
    if (filters?.category) where.category = filters.category;
    if (filters?.status) where.status = filters.status;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const items = await this.prisma.inventoryItem.findMany({
      where,
      include: {
        warehouse: true,
        supplier: true,
      },
      orderBy: { name: 'asc' },
    });

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50 });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(20).text('Reporte de Inventario', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Fecha: ${new Date().toLocaleDateString('es-HN')}`, { align: 'right' });
      doc.moveDown(2);

      // Summary
      const totalValue = items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
      const inStock = items.filter(i => i.status === 'IN_STOCK').length;
      const lowStock = items.filter(i => i.status === 'LOW_STOCK').length;
      const outOfStock = items.filter(i => i.status === 'OUT_OF_STOCK').length;

      doc.fontSize(12).text('Resumen:', { underline: true });
      doc.fontSize(10);
      doc.text(`Total de Items: ${items.length}`);
      doc.text(`En Stock: ${inStock}`);
      doc.text(`Stock Bajo: ${lowStock}`);
      doc.text(`Sin Stock: ${outOfStock}`);
      doc.text(`Valor Total: $${totalValue.toFixed(2)}`);
      doc.moveDown(2);

      // Table header
      doc.fontSize(12).text('Detalle de Items:', { underline: true });
      doc.moveDown();

      // Items table
      const tableTop = doc.y;
      const itemsPerPage = 20;
      let currentPage = 0;

      items.forEach((item, index) => {
        if (index > 0 && index % itemsPerPage === 0) {
          doc.addPage();
          currentPage++;
        }

        const y = doc.y;

        doc.fontSize(9);
        doc.text(`${index + 1}. ${item.name}`, 50, y, { width: 200 });
        doc.text(item.category, 260, y, { width: 80 });
        doc.text(`${item.quantity}`, 350, y, { width: 40 });
        doc.text(item.status, 400, y, { width: 80 });
        doc.text(`$${(item.price || 0).toFixed(2)}`, 490, y, { width: 60 });

        doc.moveDown(0.5);

        if (y > 700) {
          doc.addPage();
        }
      });

      // Footer
      doc.fontSize(8);
      doc.text(
        'Generado automaticamente por el Sistema de Inventario',
        50,
        doc.page.height - 50,
        { align: 'center' }
      );

      doc.end();
    });
  }

  async generateLowStockReport(warehouseIds?: string[] | null): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stock Bajo');

    const items = await this.prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        ...warehouseFilter(warehouseIds),
        OR: [
          { status: 'LOW_STOCK' },
          { status: 'OUT_OF_STOCK' },
        ],
      },
      include: {
        warehouse: true,
        supplier: true,
      },
      orderBy: { quantity: 'asc' },
    });

    worksheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Categoria', key: 'category', width: 20 },
      { header: 'Cantidad Actual', key: 'quantity', width: 15 },
      { header: 'Cantidad Minima', key: 'minQuantity', width: 15 },
      { header: 'Diferencia', key: 'difference', width: 12 },
      { header: 'Estado', key: 'status', width: 15 },
      { header: 'Almacen', key: 'warehouse', width: 20 },
      { header: 'Proveedor', key: 'supplier', width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF0000' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    items.forEach(item => {
      const row = worksheet.addRow({
        sku: item.sku || '',
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        difference: item.quantity - item.minQuantity,
        status: item.status,
        warehouse: item.warehouse?.name || '',
        supplier: item.supplier?.name || '',
      });

      // Highlight out of stock rows
      if (item.status === 'OUT_OF_STOCK') {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFCCCC' },
        };
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateTransactionsReport(startDate?: Date, endDate?: Date, warehouseIds?: string[] | null): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transacciones');

    const where: any = {
      ...warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']),
    };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        user: { select: { name: true, email: true } },
        items: {
          include: {
            inventoryItem: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 25 },
      { header: 'Tipo', key: 'type', width: 12 },
      { header: 'Fecha', key: 'date', width: 15 },
      { header: 'Almacen Origen', key: 'source', width: 20 },
      { header: 'Almacen Destino', key: 'destination', width: 20 },
      { header: 'Items', key: 'itemCount', width: 10 },
      { header: 'Usuario', key: 'user', width: 20 },
      { header: 'Notas', key: 'notes', width: 30 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    transactions.forEach(tx => {
      worksheet.addRow({
        id: tx.id,
        type: tx.type,
        date: tx.date.toLocaleDateString('es-HN'),
        source: tx.sourceWarehouse?.name || '-',
        destination: tx.destinationWarehouse?.name || '-',
        itemCount: tx.items.length,
        user: tx.user?.name || tx.user?.email || '',
        notes: tx.notes || '',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateLoansReport(warehouseIds?: string[] | null): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Prestamos');

    const where = warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']);

    const loans = await this.prisma.loan.findMany({
      where,
      include: {
        inventoryItem: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: { loanDate: 'desc' },
    });

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 25 },
      { header: 'Item', key: 'item', width: 30 },
      { header: 'Cantidad', key: 'quantity', width: 10 },
      { header: 'Origen', key: 'source', width: 20 },
      { header: 'Destino', key: 'destination', width: 20 },
      { header: 'Fecha Prestamo', key: 'loanDate', width: 15 },
      { header: 'Fecha Vencimiento', key: 'dueDate', width: 15 },
      { header: 'Fecha Devolucion', key: 'returnDate', width: 15 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Creado Por', key: 'createdBy', width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5B9BD5' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    loans.forEach(loan => {
      const row = worksheet.addRow({
        id: loan.id,
        item: loan.inventoryItem?.name || '',
        quantity: loan.quantity,
        source: loan.sourceWarehouse?.name || '',
        destination: loan.destinationWarehouse?.name || '',
        loanDate: loan.loanDate.toLocaleDateString('es-HN'),
        dueDate: loan.dueDate.toLocaleDateString('es-HN'),
        returnDate: loan.returnDate?.toLocaleDateString('es-HN') || '-',
        status: loan.status,
        createdBy: loan.createdBy?.name || loan.createdBy?.email || '',
      });

      if (loan.status === 'OVERDUE') {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFCCCC' },
        };
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
