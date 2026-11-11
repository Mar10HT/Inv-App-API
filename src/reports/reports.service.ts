import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilterInventoryDto } from '../inventory/dto/filter-inventory.dto';
import {
  warehouseFilter,
  warehouseFilterMultiField,
} from '../common/warehouse-access/warehouse-filter.util';
import type ExcelJSType from 'exceljs';
import {
  StockMovementsService,
  type MovementOrigin,
} from './stock-movements.service';
import { sum, toNumber } from '../common/money';

type Locale = 'en' | 'es';

// Translation map for Excel/PDF headers
const translations: Record<string, Record<Locale, string>> = {
  // Inventory headers
  sku: { en: 'SKU', es: 'SKU' },
  name: { en: 'Name', es: 'Nombre' },
  description: { en: 'Description', es: 'Descripción' },
  category: { en: 'Category', es: 'Categoría' },
  quantity: { en: 'Quantity', es: 'Cantidad' },
  minQuantity: { en: 'Min Quantity', es: 'Cantidad Mínima' },
  status: { en: 'Status', es: 'Estado' },
  price: { en: 'Price', es: 'Precio' },
  currency: { en: 'Currency', es: 'Moneda' },
  warehouse: { en: 'Warehouse', es: 'Bodega' },
  supplier: { en: 'Supplier', es: 'Proveedor' },
  itemType: { en: 'Type', es: 'Tipo' },
  serviceTag: { en: 'Service Tag', es: 'Service Tag' },
  serialNumber: { en: 'Serial Number', es: 'Número de Serie' },
  // Low stock
  currentQuantity: { en: 'Current Quantity', es: 'Cantidad Actual' },
  difference: { en: 'Difference', es: 'Diferencia' },
  // Transactions
  id: { en: 'ID', es: 'ID' },
  number: { en: 'Number', es: 'Número' },
  type: { en: 'Type', es: 'Tipo' },
  date: { en: 'Date', es: 'Fecha' },
  sourceWarehouse: { en: 'Source Warehouse', es: 'Bodega Origen' },
  destWarehouse: { en: 'Destination Warehouse', es: 'Bodega Destino' },
  items: { en: 'Items', es: 'Ítems' },
  user: { en: 'User', es: 'Usuario' },
  notes: { en: 'Notes', es: 'Notas' },
  document: { en: 'Document', es: 'Documento' },
  origin: { en: 'Origin', es: 'Origen' },
  // Loans
  item: { en: 'Item', es: 'Ítem' },
  source: { en: 'Source', es: 'Origen' },
  destination: { en: 'Destination', es: 'Destino' },
  loanDate: { en: 'Loan Date', es: 'Fecha Préstamo' },
  dueDate: { en: 'Due Date', es: 'Fecha Vencimiento' },
  returnDate: { en: 'Return Date', es: 'Fecha Devolución' },
  createdBy: { en: 'Created By', es: 'Creado Por' },
  // Summary
  totalItems: { en: 'Total Items:', es: 'Total de Ítems:' },
  totalValue: { en: 'Total Value:', es: 'Valor Total:' },
  inventoryReport: { en: 'Inventory Report', es: 'Reporte de Inventario' },
  // Worksheet names
  wsInventory: { en: 'Inventory', es: 'Inventario' },
  wsLowStock: { en: 'Low Stock', es: 'Stock Bajo' },
  wsTransactions: { en: 'Transactions', es: 'Transacciones' },
  wsLoans: { en: 'Loans', es: 'Préstamos' },
  wsTransfers: { en: 'Transfer Requests', es: 'Transferencias' },
  wsStockTakes: { en: 'Stock Takes', es: 'Conteos Físicos' },
  wsDischarges: { en: 'Discharges', es: 'Bajas' },
  wsOutflows: { en: 'Outflows', es: 'Salidas' },
  wsDetail: { en: 'Detail', es: 'Detalle' },
  // Outflow headers
  reason: { en: 'Reason', es: 'Motivo' },
  totalQty: { en: 'Total Qty', es: 'Cant. Total' },
  cancelledBy: { en: 'Cancelled By', es: 'Cancelado Por' },
  cancelledAt: { en: 'Cancelled At', es: 'Fecha Cancelación' },
  // Transfer headers
  requestedBy: { en: 'Requested By', es: 'Solicitado Por' },
  approvedBy: { en: 'Approved By', es: 'Aprobado Por' },
  itemCount: { en: 'Item Count', es: 'Cant. Ítems' },
  // Stock take headers
  startedBy: { en: 'Started By', es: 'Iniciado Por' },
  completedBy: { en: 'Completed By', es: 'Completado Por' },
  startedAt: { en: 'Started At', es: 'Inicio' },
  completedAt: { en: 'Completed At', es: 'Completado' },
  expectedQty: { en: 'Expected Qty', es: 'Cant. Esperada' },
  countedQty: { en: 'Counted Qty', es: 'Cant. Contada' },
  variance: { en: 'Variance', es: 'Diferencia' },
  // Discharge headers
  resolvedBy: { en: 'Resolved By', es: 'Resuelto Por' },
  requestDate: { en: 'Request Date', es: 'Fecha Solicitud' },
  resolvedDate: { en: 'Resolved Date', es: 'Fecha Resolución' },
  stockTake: { en: 'Stock Take', es: 'Conteo' },
  lowStockReport: { en: 'Low Stock Report', es: 'Reporte de Stock Bajo' },
  transactionsReport: {
    en: 'Transactions Report',
    es: 'Reporte de Transacciones',
  },
  loansReport: { en: 'Loans Report', es: 'Reporte de Préstamos' },
  transfersReport: { en: 'Transfers Report', es: 'Reporte de Transferencias' },
  stockTakesReport: {
    en: 'Stock Takes Report',
    es: 'Reporte de Conteos Físicos',
  },
  dischargesReport: { en: 'Discharges Report', es: 'Reporte de Bajas' },
  outflowsReport: { en: 'Outflows Report', es: 'Reporte de Salidas' },
  // Branded heading
  generatedBy: {
    en: 'Generated on {date} by {user}',
    es: 'Generado el {date} por {user}',
  },
  scheduledReport: { en: 'scheduled report', es: 'reporte programado' },
  allWarehouses: { en: 'All warehouses', es: 'Todas las bodegas' },
  warehousesCount: { en: '{n} warehouses', es: '{n} bodegas' },
  warehouseLabel: { en: 'Warehouse: {name}', es: 'Bodega: {name}' },
  period: { en: 'Period: {from} to {to}', es: 'Período: {from} al {to}' },
  rows: { en: '{n} rows', es: '{n} registros' },
  page: { en: 'Page &P of &N', es: 'Página &P de &N' },
};

// Olancho Net palette (ARGB for ExcelJS), the same as the PDF reports
const COMPANY_NAME = 'Olancho Net';
const COLORS = {
  accent: 'FF3A5F54',
  text: 'FF1C1C18',
  dim: 'FF58553F',
  rule: 'FFCFC9B8',

  // Status cell backgrounds (light) and text (dark)
  inStock: { bg: 'FFD1FAE5', text: 'FF065F46' },
  lowStockRow: { bg: 'FFFEF3C7', text: 'FF92400E' },
  outOfStock: { bg: 'FFFEE2E2', text: 'FF991B1B' },
  overdue: { bg: 'FFFEE2E2', text: 'FF991B1B' },
  active: { bg: 'FFE0E7FF', text: 'FF3730A3' },
  returned: { bg: 'FFD1FAE5', text: 'FF065F46' },

  // Alternating row tint
  altRow: 'FFF7F6F1',

  white: 'FFFFFFFF',
  headerText: 'FFFFFFFF',
} as const;

// Rows the branded heading takes above each sheet's column header
const HEADING_ROWS = 6;

/** Who and what a report was generated for, shown under its title. */
export interface ReportContext {
  generatedById?: string;
  period?: { from: Date; to: Date };
}

// Status label translation
const STATUS_LABELS: Record<string, Record<Locale, string>> = {
  IN_STOCK: { en: 'In Stock', es: 'En Stock' },
  LOW_STOCK: { en: 'Low Stock', es: 'Stock Bajo' },
  OUT_OF_STOCK: { en: 'Out of Stock', es: 'Sin Stock' },
  ACTIVE: { en: 'Active', es: 'Activo' },
  RETURNED: { en: 'Returned', es: 'Devuelto' },
  OVERDUE: { en: 'Overdue', es: 'Vencido' },
  TRANSFER: { en: 'Transfer', es: 'Transferencia' },
  ADJUSTMENT: { en: 'Adjustment', es: 'Ajuste' },
  DISCHARGE: { en: 'Discharge', es: 'Baja' },
};

// Outflow-specific labels — keep separate from STATUS_LABELS to avoid
// clashing with other entity statuses (e.g. loan ACTIVE).
const OUTFLOW_STATUS_LABELS: Record<string, Record<Locale, string>> = {
  ACTIVE: { en: 'Recorded', es: 'Registrada' },
  CANCELLED: { en: 'Cancelled', es: 'Cancelada' },
};

const OUTFLOW_REASON_LABELS: Record<string, Record<Locale, string>> = {
  DAMAGED: { en: 'Damaged', es: 'Dañado' },
  LOST: { en: 'Lost', es: 'Perdido' },
  EXPIRED: { en: 'Expired', es: 'Vencido' },
  CONSUMED: { en: 'Consumed', es: 'Consumo' },
  SOLD: { en: 'Sold', es: 'Venta' },
  OTHER: { en: 'Other', es: 'Otro' },
};

// Mirrors Inv-App's REPORTS.MOVEMENT_ORIGIN i18n keys, so the Excel export
// reads the same as the Transactions tab it is sourced from.
const MOVEMENT_ORIGIN_LABELS: Record<MovementOrigin, Record<Locale, string>> = {
  TRANSACTION: { en: 'Manual transaction', es: 'Transacción manual' },
  SALE: { en: 'Sale', es: 'Venta' },
  PURCHASE: { en: 'Purchase', es: 'Compra' },
  OUTFLOW: { en: 'Outflow', es: 'Salida' },
  TRANSFER: { en: 'Transfer', es: 'Transferencia' },
  STOCK_TAKE: { en: 'Stock take', es: 'Conteo físico' },
};

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private readonly stockMovements: StockMovementsService,
  ) {}

  private t(key: string, locale: Locale = 'es'): string {
    return translations[key]?.[locale] || key;
  }

  private tStatus(status: string, locale: Locale): string {
    return STATUS_LABELS[status]?.[locale] || status;
  }

  private tOrigin(origin: MovementOrigin, locale: Locale): string {
    return MOVEMENT_ORIGIN_LABELS[origin]?.[locale] || origin;
  }

  // Apply branded header row to a worksheet
  private applyHeader(worksheet: ExcelJSType.Worksheet): void {
    const headerArgb = COLORS.accent;
    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
    headerRow.font = {
      bold: true,
      color: { argb: COLORS.headerText },
      size: 10,
      name: 'Calibri',
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerArgb },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.border = {
      bottom: { style: 'thin', color: { argb: headerArgb } },
    };
  }

  // Apply workbook metadata
  private applyWorkbookMeta(
    workbook: ExcelJSType.Workbook,
    title: string,
  ): void {
    workbook.creator = COMPANY_NAME;
    workbook.lastModifiedBy = COMPANY_NAME;
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = title;
    workbook.subject = title;
    workbook.keywords = `${COMPANY_NAME} inventario`;
  }

  // Style a single status cell
  private styleStatusCell(
    cell: ExcelJSType.Cell,
    status: string,
    locale: Locale,
  ): void {
    let colors: { bg: string; text: string } = COLORS.active;
    if (status === 'IN_STOCK' || status === 'RETURNED') colors = COLORS.inStock;
    else if (status === 'LOW_STOCK') colors = COLORS.lowStockRow;
    else if (status === 'OUT_OF_STOCK' || status === 'OVERDUE')
      colors = COLORS.outOfStock;

    cell.value = this.tStatus(status, locale);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.bg },
    };
    cell.font = { bold: true, color: { argb: colors.text }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Apply alternating row fill (skip header row 1)
  private applyAltRows(
    worksheet: ExcelJSType.Worksheet,
    dataRowCount: number,
  ): void {
    for (let i = 2; i <= dataRowCount + 1; i++) {
      if (i % 2 === 0) {
        worksheet.getRow(i).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
      }
    }
  }

  private fill(key: string, locale: Locale, params: Record<string, string>) {
    return Object.entries(params).reduce(
      (text, [k, v]) => text.replace(`{${k}}`, v),
      this.t(key, locale),
    );
  }

  /** "Bodega: Norte", "Todas las bodegas" or "3 bodegas" for the heading. */
  private async scopeLabel(
    warehouseIds: string[] | null | undefined,
    locale: Locale,
  ): Promise<string> {
    if (!warehouseIds) return this.t('allWarehouses', locale);
    if (warehouseIds.length !== 1) {
      return this.fill('warehousesCount', locale, {
        n: String(warehouseIds.length),
      });
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseIds[0] },
      select: { name: true },
    });
    return this.fill('warehouseLabel', locale, {
      name: warehouse?.name ?? warehouseIds[0],
    });
  }

  /**
   * Puts the Olancho Net heading above every sheet (company, fiscal data,
   * report title, who generated it and for what), and the frozen header,
   * filters, hairlines, print setup and page footer, then writes the file.
   */
  private async finish(
    workbook: ExcelJSType.Workbook,
    locale: Locale,
    warehouseIds: string[] | null | undefined,
    ctx: ReportContext,
  ): Promise<Buffer> {
    const [fiscal, user, scope] = await Promise.all([
      this.prisma.fiscalConfig.findFirst({
        select: {
          rtn: true,
          address: true,
          fiscalPhone: true,
          fiscalEmail: true,
        },
      }),
      ctx.generatedById
        ? this.prisma.user.findUnique({
            where: { id: ctx.generatedById },
            select: { name: true, email: true },
          })
        : null,
      this.scopeLabel(warehouseIds, locale),
    ]);

    const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';
    const timeZone = 'America/Tegucigalpa';
    const fmtDate = (d: Date) => d.toLocaleDateString(dateLocale, { timeZone });
    const now = new Date();
    const fiscalLine = [
      fiscal?.rtn ? `RTN ${fiscal.rtn}` : null,
      fiscal?.address,
      fiscal?.fiscalPhone,
      fiscal?.fiscalEmail,
    ]
      .filter(Boolean)
      .join(' · ');
    const title = workbook.title;

    workbook.worksheets.forEach((ws, index) => {
      const columns = ws.columnCount;
      // Data rows run until the first blank row (a summary may follow it)
      let dataRows = 0;
      while (ws.getRow(dataRows + 2).hasValues) dataRows++;
      ws.spliceRows(1, 0, ...Array.from({ length: HEADING_ROWS }, () => []));

      const line = (
        row: number,
        text: string,
        font: Partial<ExcelJSType.Font>,
      ) => {
        if (columns > 1) ws.mergeCells(row, 1, row, columns);
        const cell = ws.getCell(row, 1);
        cell.value = text;
        cell.font = { name: 'Calibri', ...font };
        cell.alignment = { vertical: 'middle' };
      };
      line(1, COMPANY_NAME, {
        size: 16,
        bold: true,
        color: { argb: COLORS.accent },
      });
      ws.getRow(1).height = 24;
      line(2, fiscalLine, { size: 9, color: { argb: COLORS.dim } });
      ws.getRow(3).height = 6;
      for (let c = 1; c <= columns; c++) {
        ws.getCell(3, c).border = {
          bottom: { style: 'medium', color: { argb: COLORS.accent } },
        };
      }
      line(4, index === 0 ? title : `${title} · ${ws.name}`, {
        size: 13,
        bold: true,
        color: { argb: COLORS.text },
      });
      ws.getRow(4).height = 22;
      const meta = [
        this.fill('generatedBy', locale, {
          date: now.toLocaleString(dateLocale, {
            timeZone,
            dateStyle: 'short',
            timeStyle: 'short',
          }),
          user: user?.name || user?.email || this.t('scheduledReport', locale),
        }),
        ctx.period
          ? this.fill('period', locale, {
              from: fmtDate(ctx.period.from),
              to: fmtDate(ctx.period.to),
            })
          : null,
        scope,
        this.fill('rows', locale, { n: String(dataRows) }),
      ];
      line(5, meta.filter(Boolean).join(' · '), {
        size: 9,
        color: { argb: COLORS.dim },
      });

      const headerRow = HEADING_ROWS + 1;
      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        if (!row.hasValues) continue;
        for (let c = 1; c <= columns; c++) {
          const cell = row.getCell(c);
          cell.font = {
            name: 'Calibri',
            size: 10,
            color: { argb: COLORS.text },
            ...(cell.font ?? {}),
          };
          cell.border = {
            bottom: { style: 'hair', color: { argb: COLORS.rule } },
          };
        }
      }

      ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow, column: columns },
      };
      ws.pageSetup = {
        ...ws.pageSetup,
        orientation: 'landscape',
        paperSize: 1 as ExcelJSType.PaperSize, // Letter
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: `${headerRow}:${headerRow}`,
      };
      ws.headerFooter = {
        oddFooter: `&L&8${COMPANY_NAME} · ${title}&R&8${this.t('page', locale)}`,
      };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateInventoryExcel(
    filters?: FilterInventoryDto,
    warehouseIds?: string[] | null,
    locale: Locale = 'es',
    ctx: ReportContext = {},
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    this.applyWorkbookMeta(workbook, this.t('inventoryReport', locale));
    const worksheet = workbook.addWorksheet(this.t('wsInventory', locale));

    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      ...warehouseFilter(warehouseIds),
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    };
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const items = await this.prisma.inventoryItem.findMany({
      where,
      include: { warehouse: true, supplier: true },
      orderBy: { name: 'asc' },
    });

    worksheet.columns = [
      { header: this.t('sku', locale), key: 'sku', width: 16 },
      { header: this.t('name', locale), key: 'name', width: 32 },
      { header: this.t('description', locale), key: 'description', width: 40 },
      { header: this.t('category', locale), key: 'category', width: 20 },
      { header: this.t('quantity', locale), key: 'quantity', width: 12 },
      { header: this.t('minQuantity', locale), key: 'minQuantity', width: 15 },
      { header: this.t('status', locale), key: 'status', width: 16 },
      { header: this.t('price', locale), key: 'price', width: 12 },
      { header: this.t('currency', locale), key: 'currency', width: 10 },
      { header: this.t('warehouse', locale), key: 'warehouse', width: 22 },
      { header: this.t('supplier', locale), key: 'supplier', width: 22 },
      { header: this.t('itemType', locale), key: 'itemType', width: 10 },
      { header: this.t('serviceTag', locale), key: 'serviceTag', width: 20 },
      {
        header: this.t('serialNumber', locale),
        key: 'serialNumber',
        width: 20,
      },
    ];

    this.applyHeader(worksheet);
    worksheet.getColumn('price').numFmt = '#,##0.00';

    items.forEach((item, idx) => {
      const row = worksheet.addRow({
        sku: item.sku || '',
        name: item.name,
        description: item.description || '',
        category: item.category,
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        status: item.status,
        price: toNumber(item.price),
        currency: item.currency,
        warehouse: item.warehouse?.name || '',
        supplier: item.supplier?.name || '',
        itemType: item.itemType,
        serviceTag: item.serviceTag || '',
        serialNumber: item.serialNumber || '',
      });
      row.height = 20;
      // Style status cell (col 7)
      this.styleStatusCell(row.getCell(7), item.status, locale);
      // Alternating rows
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
        // Re-apply status cell on top of altRow fill
        this.styleStatusCell(row.getCell(7), item.status, locale);
      }
    });

    // Summary
    worksheet.addRow({});
    const totalRow = worksheet.addRow({
      name: this.t('totalItems', locale),
      quantity: items.length,
    });
    totalRow.font = { bold: true };
    const valueRow = worksheet.addRow({
      name: this.t('totalValue', locale),
      price: sum(items.map((item) => toNumber(item.price) * item.quantity)),
    });
    valueRow.font = { bold: true };

    return this.finish(workbook, locale, warehouseIds, ctx);
  }

  async generateLowStockReport(
    warehouseIds?: string[] | null,
    locale: Locale = 'es',
    ctx: ReportContext = {},
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    this.applyWorkbookMeta(workbook, this.t('lowStockReport', locale));
    const worksheet = workbook.addWorksheet(this.t('wsLowStock', locale));

    const items = await this.prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        ...warehouseFilter(warehouseIds),
        OR: [{ status: 'LOW_STOCK' }, { status: 'OUT_OF_STOCK' }],
      },
      include: { warehouse: true, supplier: true },
      orderBy: { quantity: 'asc' },
    });

    worksheet.columns = [
      { header: this.t('sku', locale), key: 'sku', width: 16 },
      { header: this.t('name', locale), key: 'name', width: 32 },
      { header: this.t('category', locale), key: 'category', width: 20 },
      { header: this.t('currentQuantity', locale), key: 'quantity', width: 16 },
      { header: this.t('minQuantity', locale), key: 'minQuantity', width: 15 },
      { header: this.t('difference', locale), key: 'difference', width: 14 },
      { header: this.t('status', locale), key: 'status', width: 16 },
      { header: this.t('warehouse', locale), key: 'warehouse', width: 22 },
      { header: this.t('supplier', locale), key: 'supplier', width: 22 },
    ];

    this.applyHeader(worksheet);
    // Override header text to dark since amber bg is light
    worksheet.getRow(1).font = {
      bold: true,
      color: { argb: 'FF451A03' },
      size: 11,
      name: 'Calibri',
    };

    items.forEach((item, idx) => {
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
      row.height = 20;
      this.styleStatusCell(row.getCell(7), item.status, locale);
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
        this.styleStatusCell(row.getCell(7), item.status, locale);
      }
    });

    return this.finish(workbook, locale, warehouseIds, ctx);
  }

  async generateTransactionsReport(
    startDate?: Date,
    endDate?: Date,
    warehouseIds?: string[] | null,
    locale: Locale = 'es',
    ctx: ReportContext = {},
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    this.applyWorkbookMeta(workbook, this.t('transactionsReport', locale));
    const worksheet = workbook.addWorksheet(this.t('wsTransactions', locale));

    // Every stock movement (manual transactions, sales, purchases, outflows,
    // transfers and applied stock takes), same source as the Transactions
    // tab, so the export and the screen never drift apart again.
    const movements = await this.stockMovements.findAll(warehouseIds ?? null, {
      from: startDate ?? new Date(0),
      to: endDate ?? new Date(),
    });

    worksheet.columns = [
      { header: this.t('id', locale), key: 'id', width: 25 },
      { header: this.t('type', locale), key: 'type', width: 14 },
      { header: this.t('origin', locale), key: 'origin', width: 20 },
      { header: this.t('document', locale), key: 'document', width: 16 },
      { header: this.t('date', locale), key: 'date', width: 16 },
      { header: this.t('sourceWarehouse', locale), key: 'source', width: 22 },
      {
        header: this.t('destWarehouse', locale),
        key: 'destination',
        width: 22,
      },
      { header: this.t('items', locale), key: 'itemCount', width: 10 },
      { header: this.t('user', locale), key: 'user', width: 22 },
      { header: this.t('notes', locale), key: 'notes', width: 32 },
    ];

    this.applyHeader(worksheet);

    const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';

    movements.forEach((m, idx) => {
      const row = worksheet.addRow({
        id: m.id,
        type: this.tStatus(m.type, locale),
        origin: this.tOrigin(m.origin, locale),
        document: m.reference || '-',
        date: m.date.toLocaleDateString(dateLocale),
        source: m.sourceWarehouse?.name || '-',
        destination: m.destinationWarehouse?.name || '-',
        itemCount: m.items.length,
        user: m.user?.name || m.user?.email || '',
        notes: m.notes || '',
      });
      row.height = 20;
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
      }
    });

    return this.finish(workbook, locale, warehouseIds, ctx);
  }

  async generateLoansReport(
    warehouseIds?: string[] | null,
    locale: Locale = 'es',
    ctx: ReportContext = {},
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    this.applyWorkbookMeta(workbook, this.t('loansReport', locale));
    const worksheet = workbook.addWorksheet(this.t('wsLoans', locale));

    const where = warehouseFilterMultiField(warehouseIds, [
      'sourceWarehouseId',
      'destinationWarehouseId',
    ]);

    const loans = await this.prisma.loan.findMany({
      where,
      include: {
        items: { include: { inventoryItem: { select: { name: true } } } },
        sourceWarehouse: true,
        destinationWarehouse: true,
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: { loanDate: 'desc' },
    });

    worksheet.columns = [
      { header: this.t('number', locale), key: 'number', width: 14 },
      { header: this.t('item', locale), key: 'item', width: 32 },
      { header: this.t('quantity', locale), key: 'quantity', width: 10 },
      { header: this.t('source', locale), key: 'source', width: 22 },
      { header: this.t('destination', locale), key: 'destination', width: 22 },
      { header: this.t('loanDate', locale), key: 'loanDate', width: 16 },
      { header: this.t('dueDate', locale), key: 'dueDate', width: 16 },
      { header: this.t('returnDate', locale), key: 'returnDate', width: 16 },
      { header: this.t('status', locale), key: 'status', width: 14 },
      { header: this.t('createdBy', locale), key: 'createdBy', width: 22 },
    ];

    this.applyHeader(worksheet);

    const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';

    loans.forEach((loan, idx) => {
      const itemSummary = loan.items
        .map((li) => `${li.inventoryItem?.name ?? ''} x${li.quantity}`)
        .join('; ');
      const totalQty = loan.items.reduce((sum, li) => sum + li.quantity, 0);
      const row = worksheet.addRow({
        number: loan.number ?? loan.id,
        item: itemSummary,
        quantity: totalQty,
        source: loan.sourceWarehouse?.name || '',
        destination: loan.destinationWarehouse?.name || '',
        loanDate: loan.loanDate.toLocaleDateString(dateLocale),
        dueDate: loan.dueDate.toLocaleDateString(dateLocale),
        returnDate: loan.returnDate?.toLocaleDateString(dateLocale) || '-',
        status: loan.status,
        createdBy: loan.createdBy?.name || loan.createdBy?.email || '',
      });
      row.height = 20;
      this.styleStatusCell(row.getCell(9), loan.status, locale);
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
        this.styleStatusCell(row.getCell(9), loan.status, locale);
      }
    });

    return this.finish(workbook, locale, warehouseIds, ctx);
  }

  async generateTransferRequestsReport(
    warehouseIds?: string[] | null,
    locale: Locale = 'es',
    ctx: ReportContext = {},
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    this.applyWorkbookMeta(workbook, this.t('transfersReport', locale));
    const worksheet = workbook.addWorksheet(this.t('wsTransfers', locale));

    const where: Prisma.TransferRequestWhereInput = warehouseIds?.length
      ? {
          OR: [
            { sourceWarehouseId: { in: warehouseIds } },
            { destinationWarehouseId: { in: warehouseIds } },
          ],
        }
      : {};

    const transfers = await this.prisma.transferRequest.findMany({
      where,
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        requestedBy: { select: { name: true, email: true } },
        approvedBy: { select: { name: true, email: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    worksheet.columns = [
      { header: this.t('number', locale), key: 'number', width: 14 },
      { header: this.t('status', locale), key: 'status', width: 14 },
      { header: this.t('sourceWarehouse', locale), key: 'source', width: 22 },
      {
        header: this.t('destWarehouse', locale),
        key: 'destination',
        width: 22,
      },
      { header: this.t('itemCount', locale), key: 'itemCount', width: 12 },
      { header: this.t('requestedBy', locale), key: 'requestedBy', width: 22 },
      { header: this.t('approvedBy', locale), key: 'approvedBy', width: 22 },
      { header: this.t('notes', locale), key: 'notes', width: 32 },
      { header: this.t('date', locale), key: 'date', width: 16 },
    ];

    this.applyHeader(worksheet);

    const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';

    transfers.forEach((tr, idx) => {
      const row = worksheet.addRow({
        number: tr.number ?? tr.id,
        status: this.tStatus(tr.status, locale),
        source: tr.sourceWarehouse?.name || '',
        destination: tr.destinationWarehouse?.name || '',
        itemCount: tr.items.length,
        requestedBy: tr.requestedBy?.name || tr.requestedBy?.email || '',
        approvedBy: tr.approvedBy?.name || tr.approvedBy?.email || '-',
        notes: tr.notes || '',
        date: tr.createdAt.toLocaleDateString(dateLocale),
      });
      row.height = 20;
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
      }
    });

    return this.finish(workbook, locale, warehouseIds, ctx);
  }

  async generateStockTakeReport(
    warehouseIds?: string[] | null,
    locale: Locale = 'es',
    ctx: ReportContext = {},
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    this.applyWorkbookMeta(workbook, this.t('stockTakesReport', locale));

    const where: Prisma.StockTakeWhereInput = warehouseIds?.length
      ? { warehouseId: { in: warehouseIds } }
      : {};

    const stockTakes = await this.prisma.stockTake.findMany({
      where,
      include: {
        warehouse: true,
        startedBy: { select: { name: true, email: true } },
        completedBy: { select: { name: true, email: true } },
        items: { include: { item: { select: { name: true, sku: true } } } },
      },
      orderBy: { startedAt: 'desc' },
    });

    // Summary worksheet
    const summary = workbook.addWorksheet(this.t('wsStockTakes', locale));
    summary.columns = [
      { header: this.t('id', locale), key: 'id', width: 25 },
      { header: this.t('warehouse', locale), key: 'warehouse', width: 22 },
      { header: this.t('status', locale), key: 'status', width: 14 },
      { header: this.t('itemCount', locale), key: 'itemCount', width: 12 },
      { header: this.t('variance', locale), key: 'totalVariance', width: 14 },
      { header: this.t('startedBy', locale), key: 'startedBy', width: 22 },
      { header: this.t('startedAt', locale), key: 'startedAt', width: 18 },
      { header: this.t('completedBy', locale), key: 'completedBy', width: 22 },
      { header: this.t('completedAt', locale), key: 'completedAt', width: 18 },
    ];
    this.applyHeader(summary);

    const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';

    stockTakes.forEach((st, idx) => {
      const totalVariance = st.items.reduce(
        (sum, i) => sum + (i.variance || 0),
        0,
      );
      const row = summary.addRow({
        id: st.id,
        warehouse: st.warehouse?.name || '',
        status: this.tStatus(st.status, locale),
        itemCount: st.items.length,
        totalVariance,
        startedBy: st.startedBy?.name || st.startedBy?.email || '',
        startedAt: st.startedAt.toLocaleDateString(dateLocale),
        completedBy: st.completedBy?.name || st.completedBy?.email || '-',
        completedAt: st.completedAt?.toLocaleDateString(dateLocale) || '-',
      });
      row.height = 20;
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
      }
    });

    // Detail worksheet
    const detail = workbook.addWorksheet(this.t('wsDetail', locale));
    detail.columns = [
      { header: this.t('stockTake', locale), key: 'stockTakeId', width: 25 },
      { header: this.t('name', locale), key: 'name', width: 32 },
      { header: this.t('sku', locale), key: 'sku', width: 16 },
      { header: this.t('expectedQty', locale), key: 'expected', width: 16 },
      { header: this.t('countedQty', locale), key: 'counted', width: 14 },
      { header: this.t('variance', locale), key: 'variance', width: 12 },
      { header: this.t('notes', locale), key: 'notes', width: 32 },
    ];
    this.applyHeader(detail);

    let detailIdx = 0;
    for (const st of stockTakes) {
      for (const item of st.items) {
        const row = detail.addRow({
          stockTakeId: st.id,
          name: item.item?.name || '',
          sku: item.item?.sku || '',
          expected: item.expectedQty,
          counted: item.countedQty ?? '-',
          variance: item.variance ?? '-',
          notes: item.notes || '',
        });
        row.height = 20;
        if (detailIdx % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.altRow },
          };
        }
        detailIdx++;
      }
    }

    return this.finish(workbook, locale, warehouseIds, ctx);
  }

  async generateDischargesReport(
    warehouseIds?: string[] | null,
    locale: Locale = 'es',
    ctx: ReportContext = {},
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    this.applyWorkbookMeta(workbook, this.t('dischargesReport', locale));
    const worksheet = workbook.addWorksheet(this.t('wsDischarges', locale));

    const where: Prisma.DischargeRequestWhereInput = warehouseIds?.length
      ? { warehouseId: { in: warehouseIds } }
      : {};

    const discharges = await this.prisma.dischargeRequest.findMany({
      where,
      include: {
        warehouse: true,
        resolvedBy: { select: { name: true, email: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    worksheet.columns = [
      { header: this.t('id', locale), key: 'id', width: 25 },
      { header: this.t('status', locale), key: 'status', width: 14 },
      { header: this.t('warehouse', locale), key: 'warehouse', width: 22 },
      { header: this.t('itemCount', locale), key: 'itemCount', width: 12 },
      { header: this.t('user', locale), key: 'requester', width: 22 },
      { header: this.t('requestDate', locale), key: 'requestDate', width: 16 },
      { header: this.t('resolvedBy', locale), key: 'resolvedBy', width: 22 },
      {
        header: this.t('resolvedDate', locale),
        key: 'resolvedDate',
        width: 16,
      },
      { header: this.t('notes', locale), key: 'notes', width: 32 },
    ];

    this.applyHeader(worksheet);

    const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';

    discharges.forEach((dr, idx) => {
      const row = worksheet.addRow({
        id: dr.id,
        status: this.tStatus(dr.status, locale),
        warehouse: dr.warehouse?.name || '',
        itemCount: dr.items.length,
        requester: dr.requesterName || '',
        requestDate: dr.createdAt.toLocaleDateString(dateLocale),
        resolvedBy: dr.resolvedBy?.name || dr.resolvedBy?.email || '-',
        resolvedDate: dr.resolvedAt?.toLocaleDateString(dateLocale) || '-',
        notes: dr.notes || '',
      });
      row.height = 20;
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
      }
    });

    return this.finish(workbook, locale, warehouseIds, ctx);
  }

  async generateOutflowsReport(
    warehouseIds?: string[] | null,
    locale: Locale = 'es',
    ctx: ReportContext = {},
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    this.applyWorkbookMeta(workbook, this.t('outflowsReport', locale));
    const worksheet = workbook.addWorksheet(this.t('wsOutflows', locale));

    const where: Prisma.OutflowWhereInput = warehouseIds?.length
      ? { warehouseId: { in: warehouseIds } }
      : {};

    const outflows = await this.prisma.outflow.findMany({
      where,
      include: {
        warehouse: true,
        createdBy: { select: { name: true, email: true } },
        cancelledBy: { select: { name: true, email: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    worksheet.columns = [
      { header: this.t('number', locale), key: 'number', width: 14 },
      { header: this.t('status', locale), key: 'status', width: 14 },
      { header: this.t('reason', locale), key: 'reason', width: 16 },
      { header: this.t('warehouse', locale), key: 'warehouse', width: 22 },
      { header: this.t('itemCount', locale), key: 'itemCount', width: 12 },
      { header: this.t('totalQty', locale), key: 'totalQty', width: 12 },
      { header: this.t('user', locale), key: 'createdBy', width: 22 },
      { header: this.t('date', locale), key: 'createdAt', width: 16 },
      { header: this.t('cancelledBy', locale), key: 'cancelledBy', width: 22 },
      { header: this.t('cancelledAt', locale), key: 'cancelledAt', width: 16 },
      { header: this.t('notes', locale), key: 'notes', width: 32 },
    ];

    this.applyHeader(worksheet);

    const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';

    outflows.forEach((o, idx) => {
      const row = worksheet.addRow({
        number: o.number ?? o.id,
        status: OUTFLOW_STATUS_LABELS[o.status]?.[locale] ?? o.status,
        reason: OUTFLOW_REASON_LABELS[o.reason]?.[locale] ?? o.reason,
        warehouse: o.warehouse?.name || '',
        itemCount: o.items.length,
        totalQty: o.items.reduce((sum, it) => sum + it.quantity, 0),
        createdBy: o.createdBy?.name || o.createdBy?.email || '-',
        createdAt: o.createdAt.toLocaleDateString(dateLocale),
        cancelledBy: o.cancelledBy?.name || o.cancelledBy?.email || '-',
        cancelledAt: o.cancelledAt?.toLocaleDateString(dateLocale) || '-',
        notes: o.notes || '',
      });
      row.height = 20;
      if (idx % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.altRow },
        };
      }
    });

    return this.finish(workbook, locale, warehouseIds, ctx);
  }
}
