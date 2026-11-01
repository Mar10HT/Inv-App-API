import { Injectable, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAGE_MARGIN,
  drawFooter,
  drawHeader,
  drawKeyValues,
  drawScope,
  drawSheetFrame,
  drawSignatures,
  drawTable,
  drawTitle,
  drawTotals,
  type HeaderData,
  type KeyValueRow,
  type ScopePair,
  type TableColumn,
  type TotalsRow,
} from './receipt-components';

type Locale = 'es' | 'en';

// Prisma.Decimal -> plain number for the PDF layout math below (multiply,
// accumulate into per-currency totals, .toFixed()). null/undefined stay
// null (meaning "no price set", rendered as an em dash) rather than 0 —
// unlike src/common/money.ts's toNumber(), which treats null as 0 because
// a balance has no "no amount yet" vs "zero amount" distinction to keep.
function toAmount(
  n: Prisma.Decimal | number | null | undefined,
): number | null {
  return n == null ? null : Number(n);
}

// Terminal-failure statuses that should be watermarked as VOID so a printed
// PDF can't be confused with a real receipt. Loans use 'CANCELLED' and
// transfers use 'CANCELLED' or 'REJECTED'.
const VOID_STATUSES = new Set(['CANCELLED', 'REJECTED']);

interface ReceiptItem {
  name: string;
  serviceTag?: string | null;
  quantity: number;
  unitPrice: number | null;
  // Sale/purchase-specific: the line's own persisted subtotal (SaleItem/
  // PurchaseInvoiceItem.lineTotal, snapshot of quantity * unitPrice at save
  // time). Undefined for loan/transfer/outflow items, whose models have no
  // lineTotal column — the renderer falls back to recomputing for those.
  lineTotal?: number | null;
  currency: string | null;
  // Sale-specific: stored per-line tax (already resolved at save time —
  // null taxPercent here just means "no explicit line override was stored",
  // not "untaxed"; the amount is what was actually charged).
  taxPercent?: number | null;
  taxAmount?: number | null;
}

interface ReceiptContext {
  documentType: 'loan' | 'transfer' | 'outflow' | 'sale' | 'purchase';
  id: string;
  status: string;
  sourceWarehouse: string;
  destinationWarehouse: string;
  createdAt: Date;
  // Loan-specific: when the loan actually started, distinct from createdAt
  // (which can lag behind a backfilled/imported record).
  loanDate?: Date | null;
  dueDate?: Date | null;
  createdBy: string;
  items: ReceiptItem[];
  // Outflow-specific metadata
  reason?: string | null;
  warehouseLabel?: string | null;
  // Sale-specific metadata
  customerName?: string | null;
  clientRtn?: string | null;
  // Sale/PurchaseInvoice-specific metadata
  paymentCondition?: string | null;
  // Purchase-specific metadata
  supplierName?: string | null;
  supplierRtn?: string | null;
  supplierInvoiceNumber?: string | null;
  // The document's own correlative: PRE-/TRA-/SAL- for loans, transfers
  // and outflows, COM- for purchases, the invoice number for a sale (null
  // while it's a DRAFT quotation, which shows quoteNumber instead).
  number?: string | null;
  quoteNumber?: string | null;
  // Default tax percent (Sale/PurchaseInvoice), used only to resolve a
  // line's effective percent for display when that line's own taxPercent is null.
  taxPercent?: number | null;
  // Sale/PurchaseInvoice are single-currency documents (every line is
  // created with the document's own currency — see Sale.currency comment
  // in the schema), so their grand total/tax are read from these persisted
  // fields rather than re-summed from the items on screen.
  totalAmount?: number | null;
  taxAmount?: number | null;
}

const STRINGS = {
  es: {
    loanTitle: 'Recibo de Préstamo',
    transferTitle: 'Recibo de Transferencia',
    outflowTitle: 'Recibo de Salida',
    saleTitle: 'Recibo de Venta',
    purchaseTitle: 'Recibo de Compra',
    quotationTitle: 'Cotización',
    loanSubtitle: 'Préstamo de material',
    outflowSubtitle: 'Baja de inventario',
    saleSubtitle: 'Comprobante de venta',
    purchaseSubtitle: 'Comprobante de compra',
    quotationSubtitle: 'Cotización de venta',
    voidCancelled: 'CANCELADO',
    voidRejected: 'RECHAZADO',
    invoiceNumber: 'Venta Nº',
    quoteNumber: 'Cotización Nº',
    loanNumber: 'Préstamo Nº',
    transferNumber: 'Transferencia Nº',
    outflowNumber: 'Salida Nº',
    purchaseNumber: 'Compra Nº',
    rtn: 'RTN',
    supplier: 'Proveedor',
    supplierInvoiceLabel: 'Factura del proveedor',
    paymentCondition: 'Forma de pago',
    paymentConditions: { CASH: 'Contado', CREDIT: 'Crédito' } as Record<
      string,
      string
    >,
    colTax: 'ISV',
    exempt: 'Exento',
    subtotal: 'Subtotal',
    tax: 'Impuesto (ISV, s/líneas gravadas)',
    status: 'Estado',
    warehouse: 'Bodega',
    reason: 'Motivo',
    customer: 'Cliente',
    loanDate: 'Fecha de préstamo',
    expectedReturn: 'Devolución esperada',
    items: 'Productos',
    colItem: 'Producto',
    colQty: 'Cant.',
    colQuantity: 'Cantidad',
    colUnit: 'Precio unit.',
    colSubtotal: 'Subtotal',
    total: 'Total',
    noPrice: '—',
    deliveredBy: 'Entregado por',
    receivedBy: 'Recibido por',
    receivedByCustomer: 'Recibido por (cliente)',
    authorizedBy: 'Autorizado por',
    withdrawnBy: 'Retirado por',
    dispatchedBy: 'Despachado por',
    autoGenerated: 'Documento generado automáticamente',
    legalSale:
      'Documento generado automáticamente por Obsid. Este comprobante es un recibo interno de control; no sustituye una factura fiscal con CAI.',
    page: 'Página',
    of: 'de',
    reasons: {
      DAMAGED: 'Dañado',
      LOST: 'Perdido',
      EXPIRED: 'Vencido',
      CONSUMED: 'Consumo interno',
      SOLD: 'Venta',
      OTHER: 'Otro',
    } as Record<string, string>,
    // Union of LoanStatus/RequestStatus(transfer)/OutflowStatus/SaleStatus/
    // PurchaseInvoiceStatus — ctx.status was rendered untranslated before
    // ("ACTIVE" instead of "Activo"), per Inv-App/docs/PENDIENTES.md.
    statuses: {
      PENDING: 'Pendiente',
      SENT: 'Enviado',
      RECEIVED: 'Recibido',
      RETURN_PENDING: 'Devolución pendiente',
      RETURNED: 'Devuelto',
      OVERDUE: 'Vencido',
      CANCELLED: 'Cancelado',
      ACTIVE: 'Activo',
      DRAFT: 'Borrador',
      APPROVED: 'Aprobado',
      COMPLETED: 'Completado',
      REJECTED: 'Rechazado',
    } as Record<string, string>,
  },
  en: {
    loanTitle: 'Loan Receipt',
    transferTitle: 'Transfer Receipt',
    outflowTitle: 'Outflow Receipt',
    saleTitle: 'Sale Receipt',
    purchaseTitle: 'Purchase Receipt',
    quotationTitle: 'Quotation',
    loanSubtitle: 'Loan of material',
    outflowSubtitle: 'Inventory discharge',
    saleSubtitle: 'Sale receipt',
    purchaseSubtitle: 'Purchase receipt',
    quotationSubtitle: 'Sales quotation',
    voidCancelled: 'CANCELLED',
    voidRejected: 'REJECTED',
    invoiceNumber: 'Sale No.',
    quoteNumber: 'Quotation No.',
    loanNumber: 'Loan No.',
    transferNumber: 'Transfer No.',
    outflowNumber: 'Outflow No.',
    purchaseNumber: 'Purchase No.',
    rtn: 'RTN',
    supplier: 'Supplier',
    supplierInvoiceLabel: 'Supplier invoice',
    paymentCondition: 'Payment method',
    paymentConditions: { CASH: 'Cash', CREDIT: 'Credit' } as Record<
      string,
      string
    >,
    colTax: 'Tax',
    exempt: 'Exempt',
    subtotal: 'Subtotal',
    tax: 'Tax (ISV, on taxed lines)',
    status: 'Status',
    warehouse: 'Warehouse',
    reason: 'Reason',
    customer: 'Customer',
    loanDate: 'Loan date',
    expectedReturn: 'Expected return',
    items: 'Items',
    colItem: 'Item',
    colQty: 'Qty',
    colQuantity: 'Quantity',
    colUnit: 'Unit price',
    colSubtotal: 'Subtotal',
    total: 'Total',
    noPrice: '—',
    deliveredBy: 'Delivered by',
    receivedBy: 'Received by',
    receivedByCustomer: 'Received by (customer)',
    authorizedBy: 'Authorized by',
    withdrawnBy: 'Withdrawn by',
    dispatchedBy: 'Dispatched by',
    autoGenerated: 'Auto-generated document',
    legalSale:
      'Document automatically generated by Obsid. This voucher is an internal control receipt; it does not replace a CAI-authorized fiscal invoice.',
    page: 'Page',
    of: 'of',
    reasons: {
      DAMAGED: 'Damaged',
      LOST: 'Lost',
      EXPIRED: 'Expired',
      CONSUMED: 'Consumed',
      SOLD: 'Sold',
      OTHER: 'Other',
    } as Record<string, string>,
    statuses: {
      PENDING: 'Pending',
      SENT: 'Sent',
      RECEIVED: 'Received',
      RETURN_PENDING: 'Return pending',
      RETURNED: 'Returned',
      OVERDUE: 'Overdue',
      CANCELLED: 'Cancelled',
      ACTIVE: 'Active',
      DRAFT: 'Draft',
      APPROVED: 'Approved',
      COMPLETED: 'Completed',
      REJECTED: 'Rejected',
    } as Record<string, string>,
  },
} as const;

type Strings = (typeof STRINGS)[Locale];

// Pure helpers for render() below — kept outside the class since they only
// need ctx/t/fmt*, no DI, and this keeps render() itself readable.

/**
 * The per-document-type set of sections render() draws, built once per
 * request by buildLayout() below. Every section is optional except
 * signatures/footerLegal, which every document type always has — render()
 * draws each present section in a fixed order (scope, keyValues, table,
 * totals) and skips whatever's missing, matching the per-type structure the
 * template actually uses (see the per-type table in the plan this ported).
 */
interface ReceiptLayout {
  scope?: ScopePair[];
  keyValues?: KeyValueRow[];
  table?: { columns: TableColumn[]; rows: Record<string, string>[] };
  totals?: TotalsRow[];
  signatures: string[];
  footerLegal: string;
}

/**
 * The template has no dedicated "service tag" column (Decision 3) — when an
 * item has one, it's folded into the product name instead, everywhere a
 * product name is rendered (trade table, narrow transfer table, kv rows).
 */
function formatItemName(name: string, serviceTag?: string | null): string {
  const base = name || '—';
  return serviceTag ? `${base} · ${serviceTag}` : base;
}

/**
 * Sale/Purchase share the same 5-column table (Producto/Cant./Precio
 * Unit./ISV/Subtotal) — widths are the template's columns converted to PDF
 * points, summing to the 512pt usable width (612 - 2*50 margins).
 */
function tradeTableColumns(t: Strings): TableColumn[] {
  return [
    { key: 'item', header: t.colItem, width: 212, align: 'center' },
    { key: 'qty', header: t.colQty, width: 50, align: 'center' },
    { key: 'unit', header: t.colUnit, width: 90, align: 'right' },
    { key: 'tax', header: t.colTax, width: 50, align: 'center' },
    { key: 'sub', header: t.colSubtotal, width: 110, align: 'right' },
  ];
}

/** Transfer's narrower 2-column table (Producto/Cantidad), same 512pt width. */
function transferTableColumns(t: Strings): TableColumn[] {
  return [
    { key: 'item', header: t.colItem, width: 392, align: 'center' },
    { key: 'qty', header: t.colQuantity, width: 120, align: 'center' },
  ];
}

function buildTradeTableRow(
  item: ReceiptItem,
  ctx: ReceiptContext,
  t: Strings,
  fmtAmount: (amount: number | null, currency: string | null) => string,
): Record<string, string> {
  // Sale/purchase lines carry their own persisted lineTotal — use it instead
  // of recomputing, so the PDF never drifts from what the document actually
  // saved.
  const sub =
    item.lineTotal ??
    (item.unitPrice != null ? item.unitPrice * item.quantity : null);
  const effectivePercent = item.taxPercent ?? ctx.taxPercent ?? 0;
  return {
    item: formatItemName(item.name, item.serviceTag),
    qty: String(item.quantity),
    unit: fmtAmount(item.unitPrice, item.currency),
    tax: effectivePercent > 0 ? `${effectivePercent}%` : t.exempt,
    sub: fmtAmount(sub, item.currency),
  };
}

function buildTransferTableRow(item: ReceiptItem): Record<string, string> {
  return {
    item: formatItemName(item.name, item.serviceTag),
    qty: String(item.quantity),
  };
}

/**
 * The template's Salida/Préstamo kv blocks assume a single product line.
 * Decision 4 (Opción A): with exactly 1 item, the Producto/Cantidad rows
 * show that item's own name/quantity, same as the template. With 2+ items,
 * the label flips to plural and the value lists up to the first 3 names
 * (comma-joined) plus "+N" for the rest — same truncation pattern as the
 * frontend's Asignaciones report — while quantity becomes the sum across
 * every item. Never renders a table, only ever this kv row pair.
 */
function summarizeItems(
  items: ReceiptItem[],
  t: Strings,
): { label: string; value: string; quantity: number } {
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  if (items.length <= 1) {
    const only = items[0];
    return {
      label: t.colItem,
      value: only ? formatItemName(only.name, only.serviceTag) : t.noPrice,
      quantity,
    };
  }
  const names = items.map((item) => formatItemName(item.name, item.serviceTag));
  const shown = names.slice(0, 3).join(', ');
  const extra = names.length > 3 ? ` +${names.length - 3}` : '';
  return { label: t.items, value: `${shown}${extra}`, quantity };
}

/**
 * Sale and PurchaseInvoice (the only two documentTypes with totals) are
 * single-currency documents -- every line is created with the document's
 * own currency -- so unlike a multi-currency report total, there's never a
 * second "Subtotal USD" row to disambiguate from. The template's labels are
 * plain "Subtotal"/"Total"; the currency only shows up in the value itself
 * (fmtAmount already prefixes it).
 */
function buildTotalsRows(
  ctx: ReceiptContext,
  t: Strings,
  fmtAmount: (amount: number | null, currency: string | null) => string,
): TotalsRow[] {
  const currency = ctx.items[0]?.currency ?? null;
  const amount = ctx.totalAmount ?? 0;
  const tax = ctx.taxAmount ?? 0;
  const rows: TotalsRow[] = [
    { label: t.subtotal, value: fmtAmount(amount, currency) },
  ];
  if (tax > 0) {
    rows.push({ label: t.tax, value: fmtAmount(tax, currency) });
    rows.push({
      label: t.total,
      value: fmtAmount(amount + tax, currency),
      grand: true,
    });
  } else {
    rows.push({
      label: t.total,
      value: fmtAmount(amount, currency),
      grand: true,
    });
  }
  return rows;
}

function resolvePaymentCondition(ctx: ReceiptContext, t: Strings): string {
  if (!ctx.paymentCondition) return t.noPrice;
  return t.paymentConditions[ctx.paymentCondition] ?? ctx.paymentCondition;
}

function buildSaleLayout(
  ctx: ReceiptContext,
  t: Strings,
  fmtAmount: (amount: number | null, currency: string | null) => string,
): ReceiptLayout {
  return {
    scope: [
      { label: t.customer, value: ctx.customerName ?? t.noPrice },
      { label: t.rtn, value: ctx.clientRtn ?? t.noPrice },
      { label: t.paymentCondition, value: resolvePaymentCondition(ctx, t) },
    ],
    table: {
      columns: tradeTableColumns(t),
      rows: ctx.items.map((item) =>
        buildTradeTableRow(item, ctx, t, fmtAmount),
      ),
    },
    totals: buildTotalsRows(ctx, t, fmtAmount),
    // Decision 6: a DRAFT sale (quotation) shares this same layout/legal
    // text — the only thing that differs for it is the title/subtitle,
    // resolved separately in resolveTitle()/resolveSubtitle().
    signatures: [t.deliveredBy, t.receivedByCustomer],
    footerLegal: t.legalSale,
  };
}

function buildPurchaseLayout(
  ctx: ReceiptContext,
  t: Strings,
  fmtAmount: (amount: number | null, currency: string | null) => string,
): ReceiptLayout {
  return {
    scope: [
      { label: t.supplier, value: ctx.supplierName ?? t.noPrice },
      { label: t.rtn, value: ctx.supplierRtn ?? t.noPrice },
      {
        label: t.supplierInvoiceLabel,
        value: ctx.supplierInvoiceNumber ?? t.noPrice,
      },
      { label: t.paymentCondition, value: resolvePaymentCondition(ctx, t) },
    ],
    table: {
      columns: tradeTableColumns(t),
      rows: ctx.items.map((item) =>
        buildTradeTableRow(item, ctx, t, fmtAmount),
      ),
    },
    totals: buildTotalsRows(ctx, t, fmtAmount),
    // Decision 1: "Recibido por" (generic, not "(cliente)") / "Entregado
    // por (proveedor)" — reuses the existing receivedBy/deliveredBy labels
    // instead of adding two more single-use strings.
    signatures: [
      t.receivedBy,
      `${t.deliveredBy} (${t.supplier.toLowerCase()})`,
    ],
    footerLegal: t.autoGenerated,
  };
}

function buildOutflowLayout(ctx: ReceiptContext, t: Strings): ReceiptLayout {
  const summary = summarizeItems(ctx.items, t);
  return {
    keyValues: [
      {
        label: t.reason,
        value: ctx.reason ? (t.reasons[ctx.reason] ?? ctx.reason) : t.noPrice,
      },
      { label: summary.label, value: summary.value },
      { label: t.colQuantity, value: String(summary.quantity) },
      { label: t.warehouse, value: ctx.warehouseLabel ?? ctx.sourceWarehouse },
    ],
    signatures: [t.authorizedBy, t.withdrawnBy],
    footerLegal: t.autoGenerated,
  };
}

function buildLoanLayout(
  ctx: ReceiptContext,
  t: Strings,
  fmtDate: (d: Date) => string,
): ReceiptLayout {
  const summary = summarizeItems(ctx.items, t);
  return {
    keyValues: [
      { label: summary.label, value: summary.value },
      { label: t.colQuantity, value: String(summary.quantity) },
      {
        label: t.loanDate,
        value: ctx.loanDate ? fmtDate(ctx.loanDate) : t.noPrice,
      },
      {
        label: t.expectedReturn,
        value: ctx.dueDate ? fmtDate(ctx.dueDate) : t.noPrice,
      },
      { label: t.status, value: t.statuses[ctx.status] ?? ctx.status },
    ],
    // Decision 2: always the destination warehouse's name, never a
    // person-name fallback — simpler and always available.
    signatures: [
      t.deliveredBy,
      `${t.receivedBy} (${ctx.destinationWarehouse})`,
    ],
    footerLegal: t.autoGenerated,
  };
}

function buildTransferLayout(ctx: ReceiptContext, t: Strings): ReceiptLayout {
  return {
    table: {
      columns: transferTableColumns(t),
      rows: ctx.items.map(buildTransferTableRow),
    },
    signatures: [
      `${t.dispatchedBy} (${ctx.sourceWarehouse})`,
      `${t.receivedBy} (${ctx.destinationWarehouse})`,
    ],
    footerLegal: t.autoGenerated,
  };
}

/** Dispatches to the per-type layout builder — the one place that knows
 * which document type gets which sections. */
function buildLayout(
  ctx: ReceiptContext,
  t: Strings,
  fmtDate: (d: Date) => string,
  fmtAmount: (amount: number | null, currency: string | null) => string,
): ReceiptLayout {
  switch (ctx.documentType) {
    case 'sale':
      return buildSaleLayout(ctx, t, fmtAmount);
    case 'purchase':
      return buildPurchaseLayout(ctx, t, fmtAmount);
    case 'outflow':
      return buildOutflowLayout(ctx, t);
    case 'loan':
      return buildLoanLayout(ctx, t, fmtDate);
    case 'transfer':
      return buildTransferLayout(ctx, t);
  }
}

/**
 * Builds the drawHeader() payload: the fiscal address/phone/email join,
 * plus the already-resolved docbox label/number and date/user lines.
 */
function buildHeaderData(
  fiscalConfig: {
    rtn: string | null;
    address: string | null;
    fiscalPhone: string | null;
    fiscalEmail: string | null;
  } | null,
  docBox: { label: string; number: string | null },
  ctx: ReceiptContext,
  fmtDateTime: (d: Date) => string,
): HeaderData {
  const addressLine =
    [
      fiscalConfig?.address,
      fiscalConfig?.fiscalPhone,
      fiscalConfig?.fiscalEmail,
    ]
      .filter(Boolean)
      .join(' · ') || null;
  return {
    logoPath: join(__dirname, 'assets', 'olanchonet-logo.png'),
    rtn: fiscalConfig?.rtn ?? null,
    addressLine,
    docLabel: docBox.label,
    docNumber: docBox.number,
    dateLine: fmtDateTime(ctx.createdAt),
    userLine: ctx.createdBy,
  };
}

/**
 * Stamps the footer (rule + legal text + page info/ref) and, for a
 * cancelled/rejected document, a diagonal VOID watermark, on every buffered
 * page. Runs after the whole body has been laid out (bufferPages: true)
 * since only then is the final page count known.
 */
function stampFooterAndVoidWatermark(
  doc: PDFKit.PDFDocument,
  t: Strings,
  status: string,
  legalText: string,
  ref: string,
  left: number,
  right: number,
): void {
  const { width, height } = doc.page;
  const range = doc.bufferedPageRange();
  const isVoid = VOID_STATUSES.has(status);
  const voidLabel = status === 'REJECTED' ? t.voidRejected : t.voidCancelled;

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawSheetFrame(doc);
    const pageInfo = `${t.page} ${i + 1 - range.start} ${t.of} ${range.count}`;
    drawFooter(
      doc,
      legalText,
      pageInfo,
      `Ref. ${ref}`,
      left,
      right,
      height - PAGE_MARGIN + 10,
    );
    if (isVoid) {
      doc.save();
      doc.opacity(0.18);
      doc.rotate(-30, { origin: [width / 2, height / 2] });
      doc.font('Helvetica-Bold').fontSize(110).fillColor('#dc2626');
      doc.text(voidLabel, 0, height / 2 - 60, { width, align: 'center' });
      doc.restore();
    }
  }
}

@Injectable()
export class PdfReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateLoanReceipt(
    loanId: string,
    locale: Locale = 'es',
  ): Promise<Buffer> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        sourceWarehouse: { select: { name: true } },
        destinationWarehouse: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
        items: {
          include: {
            inventoryItem: {
              select: {
                name: true,
                serviceTag: true,
                price: true,
                currency: true,
              },
            },
          },
        },
      },
    });

    if (!loan) throw new NotFoundException('Loan not found');

    return this.render(
      {
        documentType: 'loan',
        id: loan.id,
        number: loan.number,
        status: loan.status,
        sourceWarehouse: loan.sourceWarehouse?.name ?? '',
        destinationWarehouse: loan.destinationWarehouse?.name ?? '',
        createdAt: loan.createdAt,
        loanDate: loan.loanDate,
        dueDate: loan.dueDate,
        createdBy: loan.createdBy?.name || loan.createdBy?.email || '',
        items: loan.items.map((li) => ({
          name: li.inventoryItem?.name ?? '',
          serviceTag: li.inventoryItem?.serviceTag,
          quantity: li.quantity,
          unitPrice: toAmount(li.inventoryItem?.price),
          currency: li.inventoryItem?.currency ?? null,
        })),
      },
      locale,
    );
  }

  async generateOutflowReceipt(
    outflowId: string,
    locale: Locale = 'es',
  ): Promise<Buffer> {
    const outflow = await this.prisma.outflow.findUnique({
      where: { id: outflowId },
      include: {
        warehouse: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
        items: {
          include: {
            inventoryItem: { select: { name: true, serviceTag: true } },
          },
        },
      },
    });

    if (!outflow) throw new NotFoundException('Outflow not found');

    return this.render(
      {
        documentType: 'outflow',
        id: outflow.id,
        number: outflow.number,
        status: outflow.status,
        sourceWarehouse: outflow.warehouse?.name ?? '',
        destinationWarehouse: '',
        warehouseLabel: outflow.warehouse?.name ?? '',
        reason: outflow.reason,
        createdAt: outflow.createdAt,
        createdBy: outflow.createdBy?.name || outflow.createdBy?.email || '',
        items: outflow.items.map((line) => ({
          // Prefer snapshot fields — they survive item renames and deletions.
          name: line.itemName ?? line.inventoryItem?.name ?? '',
          serviceTag: line.serviceTag ?? line.inventoryItem?.serviceTag,
          quantity: line.quantity,
          unitPrice: toAmount(line.unitPrice),
          currency: line.currency ?? null,
        })),
      },
      locale,
    );
  }

  async generateSaleReceipt(
    saleId: string,
    locale: Locale = 'es',
  ): Promise<Buffer> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        warehouse: { select: { name: true } },
        // rtn: a sales:view-only role (no clients:view) can reach this via
        // GET /sales/:id/pdf and see the client's RTN, which the plain
        // GET /sales/:id response never includes. Accepted deliberately: RTN
        // is a Honduran tax ID meant to print on commercial receipts (the
        // client-approved template requires it on Venta), not secret PII,
        // and sales:view already exposes client.name on the sale itself —
        // product decision 2026-11-01, not a gap to close.
        client: { select: { name: true, rtn: true } },
        createdBy: { select: { name: true, email: true } },
        items: {
          include: {
            inventoryItem: { select: { name: true, serviceTag: true } },
          },
        },
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');

    return this.render(
      {
        documentType: 'sale',
        id: sale.id,
        quoteNumber: sale.quoteNumber,
        status: sale.status,
        sourceWarehouse: sale.warehouse?.name ?? '',
        destinationWarehouse: '',
        warehouseLabel: sale.warehouse?.name ?? '',
        // The linked Client (used for credit-limit tracking) is the
        // authoritative name when present — customerName is only the
        // free-text fallback for a walk-in sale with no client record.
        customerName: sale.client?.name ?? sale.customerName,
        clientRtn: sale.client?.rtn,
        paymentCondition: sale.paymentCondition,
        createdAt: sale.createdAt,
        createdBy: sale.createdBy?.name || sale.createdBy?.email || '',
        number: sale.number,
        taxPercent: toAmount(sale.taxPercent),
        totalAmount: toAmount(sale.totalAmount),
        taxAmount: toAmount(sale.taxAmount),
        items: sale.items.map((line) => ({
          // Prefer snapshot fields — they survive item renames and deletions.
          name: line.itemName ?? line.inventoryItem?.name ?? '',
          serviceTag: line.serviceTag ?? line.inventoryItem?.serviceTag,
          quantity: line.quantity,
          unitPrice: toAmount(line.unitPrice),
          lineTotal: toAmount(line.lineTotal),
          currency: line.currency ?? null,
          taxPercent: toAmount(line.taxPercent),
          taxAmount: toAmount(line.taxAmount),
        })),
      },
      locale,
    );
  }

  async generatePurchaseReceipt(
    purchaseInvoiceId: string,
    locale: Locale = 'es',
  ): Promise<Buffer> {
    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoiceId },
      include: {
        warehouse: { select: { name: true } },
        supplier: { select: { name: true, rtn: true } },
        createdBy: { select: { name: true, email: true } },
        items: {
          include: {
            inventoryItem: { select: { name: true, serviceTag: true } },
          },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Purchase invoice not found');

    return this.render(
      {
        documentType: 'purchase',
        id: invoice.id,
        status: invoice.status,
        sourceWarehouse: invoice.warehouse?.name ?? '',
        destinationWarehouse: '',
        warehouseLabel: invoice.warehouse?.name ?? '',
        supplierName: invoice.supplier?.name,
        supplierRtn: invoice.supplier?.rtn,
        supplierInvoiceNumber: invoice.invoiceNumber,
        paymentCondition: invoice.paymentCondition,
        createdAt: invoice.createdAt,
        createdBy: invoice.createdBy?.name || invoice.createdBy?.email || '',
        number: invoice.number,
        taxPercent: toAmount(invoice.taxPercent),
        totalAmount: toAmount(invoice.totalAmount),
        taxAmount: toAmount(invoice.taxAmount),
        items: invoice.items.map((line) => ({
          // Prefer snapshot fields — they survive item renames and deletions.
          name: line.itemName ?? line.inventoryItem?.name ?? '',
          serviceTag: line.serviceTag ?? line.inventoryItem?.serviceTag,
          quantity: line.quantity,
          unitPrice: toAmount(line.unitPrice),
          lineTotal: toAmount(line.lineTotal),
          currency: line.currency,
          taxPercent: toAmount(line.taxPercent),
          taxAmount: toAmount(line.taxAmount),
        })),
      },
      locale,
    );
  }

  async generateTransferReceipt(
    transferId: string,
    locale: Locale = 'es',
  ): Promise<Buffer> {
    const transfer = await this.prisma.transferRequest.findUnique({
      where: { id: transferId },
      include: {
        sourceWarehouse: { select: { name: true } },
        destinationWarehouse: { select: { name: true } },
        requestedBy: { select: { name: true, email: true } },
        items: {
          include: {
            inventoryItem: {
              select: { name: true, serviceTag: true },
            },
          },
        },
      },
    });

    if (!transfer) throw new NotFoundException('Transfer request not found');

    return this.render(
      {
        documentType: 'transfer',
        id: transfer.id,
        number: transfer.number,
        status: transfer.status,
        sourceWarehouse: transfer.sourceWarehouse?.name ?? '',
        destinationWarehouse: transfer.destinationWarehouse?.name ?? '',
        createdAt: transfer.createdAt,
        createdBy:
          transfer.requestedBy?.name || transfer.requestedBy?.email || '',
        items: transfer.items.map((li) => ({
          name: li.inventoryItem?.name ?? '',
          serviceTag: li.inventoryItem?.serviceTag,
          quantity: li.quantity,
          // TransferRequestItem has no per-line price/currency (it never
          // shows one in the template's narrow Producto/Cantidad table).
          unitPrice: null,
          currency: null,
        })),
      },
      locale,
    );
  }

  /**
   * A DRAFT sale is a quotation, not an invoice yet — distinct title, and
   * never the loan/transfer/outflow titles since only 'sale' can be DRAFT.
   */
  private resolveTitle(
    ctx: Pick<ReceiptContext, 'documentType' | 'status'>,
    t: Strings,
  ): string {
    if (ctx.documentType === 'sale' && ctx.status === 'DRAFT') {
      return t.quotationTitle;
    }
    if (ctx.documentType === 'loan') return t.loanTitle;
    if (ctx.documentType === 'transfer') return t.transferTitle;
    if (ctx.documentType === 'sale') return t.saleTitle;
    if (ctx.documentType === 'purchase') return t.purchaseTitle;
    return t.outflowTitle;
  }

  /**
   * Transfer has no fixed subtitle in the template -- it shows the route
   * ("Bodega Central -> Bodega Norte") instead, built from the same
   * sourceWarehouse/destinationWarehouse names the signatures use. Uses an
   * ASCII "->" rather than U+2192: PDFKit's standard Helvetica only has
   * WinAnsiEncoding, which doesn't include that glyph (it silently renders
   * as garbage), and embedding a Unicode font was ruled out in Fase 0.
   */
  private resolveSubtitle(
    ctx: Pick<
      ReceiptContext,
      'documentType' | 'status' | 'sourceWarehouse' | 'destinationWarehouse'
    >,
    t: Strings,
  ): string {
    if (ctx.documentType === 'sale' && ctx.status === 'DRAFT') {
      return t.quotationSubtitle;
    }
    if (ctx.documentType === 'loan') return t.loanSubtitle;
    if (ctx.documentType === 'transfer') {
      return `${ctx.sourceWarehouse} -> ${ctx.destinationWarehouse}`;
    }
    if (ctx.documentType === 'sale') return t.saleSubtitle;
    if (ctx.documentType === 'purchase') return t.purchaseSubtitle;
    return t.outflowSubtitle;
  }

  /**
   * ACTIVE/CANCELLED sales and purchases show their real invoice number,
   * a DRAFT sale its quotation number, and loans, transfers and outflows
   * their own correlative (each falls back to the internal id only for a
   * document saved before numbering existed and not yet backfilled).
   * Split into label/number so drawHeader() can lay them out as separate
   * docbox rows.
   */
  private resolveDocBoxFields(
    ctx: Pick<
      ReceiptContext,
      'documentType' | 'status' | 'id' | 'number' | 'quoteNumber'
    >,
    t: Strings,
  ): { label: string; number: string | null } {
    if (ctx.documentType === 'purchase') {
      return { label: t.purchaseNumber, number: ctx.number ?? ctx.id };
    }
    if (ctx.documentType === 'sale') {
      if (ctx.status === 'DRAFT') {
        return { label: t.quoteNumber, number: ctx.quoteNumber ?? null };
      }
      return { label: t.invoiceNumber, number: ctx.number ?? ctx.id };
    }
    if (ctx.documentType === 'loan') {
      return { label: t.loanNumber, number: ctx.number ?? ctx.id };
    }
    if (ctx.documentType === 'transfer') {
      return { label: t.transferNumber, number: ctx.number ?? ctx.id };
    }
    return { label: t.outflowNumber, number: ctx.number ?? ctx.id };
  }

  private async render(ctx: ReceiptContext, locale: Locale): Promise<Buffer> {
    const t = STRINGS[locale];
    const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';
    // Date-only, no time — used for the Préstamo kv rows (template shows
    // "01/10/2026", no time there).
    const fmtDate = (d: Date) =>
      d.toLocaleDateString(dateLocale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    // Date + time, for the docbox (template shows "06/10/2026, 1:15 p.m.").
    // Node's ICU data inserts a space before "m." in es-HN's a.m./p.m. —
    // collapse it to match the template's tighter "p.m.".
    const fmtDateTime = (d: Date) =>
      d
        .toLocaleString(dateLocale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: 'numeric',
          minute: '2-digit',
        })
        .replace(/\s(?=m\.)/i, '');
    const fmtAmount = (amount: number | null, currency: string | null) => {
      if (amount == null) return t.noPrice;
      const symbol = currency === 'HNL' ? 'L.' : (currency ?? '');
      const value = amount.toLocaleString(dateLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${symbol} ${value}`.trim();
    };

    const fiscalConfig = await this.prisma.fiscalConfig.findFirst();
    const docBox = this.resolveDocBoxFields(ctx, t);
    const layout = buildLayout(ctx, t, fmtDate, fmtAmount);

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      // bufferPages so the footer and void watermark can be stamped across
      // every page once the body has been laid out.
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: PAGE_MARGIN,
        bufferPages: true,
      });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = PAGE_MARGIN;
      const right = doc.page.width - PAGE_MARGIN;

      let y = drawHeader(
        doc,
        buildHeaderData(fiscalConfig, docBox, ctx, fmtDateTime),
        left,
        right,
        PAGE_MARGIN,
      );

      y = drawTitle(
        doc,
        this.resolveTitle(ctx, t),
        this.resolveSubtitle(ctx, t),
        left,
        right,
        y,
      );

      if (layout.scope) {
        y = drawScope(doc, layout.scope, left, right, y);
      }
      if (layout.keyValues) {
        y = drawKeyValues(doc, layout.keyValues, left, right, y);
      }
      if (layout.table) {
        y = drawTable(doc, layout.table.columns, layout.table.rows, left, y);
      }
      if (layout.totals) {
        y = drawTotals(doc, layout.totals, left, right, y + 2);
      }

      drawSignatures(
        doc,
        layout.signatures,
        left,
        right,
        Math.max(y + 20, doc.page.height - 150),
      );

      const ref = `OBS-${ctx.id.slice(-6).toUpperCase()}`;
      stampFooterAndVoidWatermark(
        doc,
        t,
        ctx.status,
        layout.footerLegal,
        ref,
        left,
        right,
      );

      doc.end();
    });
  }
}
