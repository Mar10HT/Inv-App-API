import { readFileSync } from 'fs';

// Drawing primitives for the olanchonet PDF receipt layout, ported from the
// client-approved HTML template (Propuesta 5 - Recomendada). Every function
// is pure: it takes a PDFKit document plus the data/position to draw, draws
// it, and returns the y coordinate right after what it drew so the caller
// (pdf-receipts.service.ts's render()) can keep stacking sections.
//
// Sizes below are the template's CSS px values converted to PDF points via
// the standard 96dpi -> 72dpi factor (0.75). PAGE_MARGIN matches the
// PDFDocument({ margin: ... }) used by the service, so table pagination and
// the page content width line up with the rest of the layout.

export const PAGE_MARGIN = 50;

export const ACCENT = '#3a5f54';
export const ACCENT_2 = '#4d7c6f';
export const TEXT = '#1c1c18';
export const TEXT_DIM = '#58553f';
export const RULE = '#cfc9b8';
export const SOFT = '#f7f6f1';

const RULE_WIDTH = 0.75; // 1px border
const THICK_RULE_WIDTH = 1.5; // 2px accent border
const TOP_BAR_WIDTH = 3; // 4px
// ponytail: approximate single-font line-height factor instead of measuring
// actual glyph metrics per string; close enough for non-pixel-perfect phase 1.
const LINE_HEIGHT = 1.3;
const LOGO_HEIGHT = 27; // 36px
const DOCBOX_RESERVE = 150; // space reserved on the left block so long addresses don't run into the docbox

const FONT = {
  rtn: 9, // 12px
  addr: 7.875, // 10.5px
  docLabel: 7.125, // 9.5px
  docValue: 10.5, // 14px
  docMeta: 7.5, // 10px
  h1: 15, // 20px
  subtitle: 9, // 12px
  scope: 8.25, // 11px
  tableHeader: 7.5, // 10px
  tableBody: 9.375, // 12.5px
  kvLabel: 8.25, // 11px
  kvRow: 9.375, // 12.5px
  totalsRow: 9.375, // 12.5px
  totalsGrand: 11.25, // 15px
  sigWho: 7.875, // 10.5px
  footer: 7.5, // 10px
} as const;

const SPACING = {
  brandGap: 10.5, // 14px
  addrMarginTop: 1.5, // 2px
  headerPaddingBottom: 12, // 16px
  headerMarginBottom: 13.5, // 18px
  docboxPaddingV: 6, // 8px
  docboxPaddingH: 10.5, // 14px
  docboxMetaPaddingTop: 3.75, // 5px
  h1MarginBottom: 3, // 4px
  subtitleMarginBottom: 13.5, // 18px
  scopePaddingV: 6.75, // 9px
  scopePaddingH: 10.5, // 14px
  scopeMarginBottom: 16.5, // 22px
  thPaddingV: 6, // 8px
  thPaddingH: 7.5, // 10px
  tdPaddingV: 6.75, // 9px
  tdPaddingH: 7.5, // 10px
  kvRowPaddingV: 6.75, // 9px
  kvRowPaddingH: 10.5, // 14px
  kvMarginBottom: 15, // 20px
  totalsRowPaddingV: 3.75, // 5px
  totalsGrandPaddingTop: 7.5, // 10px
  signaturesGap: 36, // 48px
  sigLineMarginTop: 31.5, // 42px
  sigLineMarginBottom: 4.5, // 6px
  footerPaddingTop: 9, // 12px
} as const;

// PNG IHDR chunk: 8-byte signature, then width/height as big-endian uint32
// at byte offsets 16 and 20 — cheaper than decoding the whole image just to
// preserve the logo's aspect ratio when scaling it to LOGO_HEIGHT.
function readPngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * The template's `.sheet` card border: a 1px rule-colored border on all
 * four sides, overridden on the top edge by a thicker 4px accent bar
 * (`border: 1px solid var(--rule); border-top: 4px solid var(--accent)`).
 * In print (`@media print { .sheet { margin: 0 } }`) the sheet becomes the
 * page itself, so this draws at the true page edges, not PAGE_MARGIN --
 * content still starts at PAGE_MARGIN, same as the template's sheet
 * padding sitting inside its own border. Call once per page.
 */
export function drawSheetFrame(doc: PDFKit.PDFDocument): void {
  const { width, height } = doc.page;

  doc
    .lineWidth(RULE_WIDTH)
    .strokeColor(RULE)
    .rect(0, 0, width, height)
    .stroke();

  doc
    .lineWidth(TOP_BAR_WIDTH)
    .strokeColor(ACCENT)
    .moveTo(0, TOP_BAR_WIDTH / 2)
    .lineTo(width, TOP_BAR_WIDTH / 2)
    .stroke();
}

export interface HeaderData {
  logoPath: string;
  rtn: string | null;
  // Already joined by the caller (address, phone, email) — the kit just
  // lays out a single wrapped text block, same as the template's one-line .addr div.
  addressLine: string | null;
  docLabel: string;
  // null when the document type has no own number (e.g. a future report PDF,
  // per the "reports go without a document number" decision) — the dl/dm
  // rows still draw, the dv (number) row is skipped.
  docNumber: string | null;
  dateLine: string;
  userLine: string;
}

/**
 * Logo + fiscal info on the left, bordered document box (number/date/user)
 * on the right, 1px accent rule across the bottom of the whole block.
 */
export function drawHeader(
  doc: PDFKit.PDFDocument,
  data: HeaderData,
  left: number,
  right: number,
  top: number,
): number {
  // doc.openImage() would give us the natural size without a second file
  // read, but it isn't declared in @types/pdfkit — read the PNG header
  // directly instead. ponytail: assumes PNG (the logo always is); swap for
  // a real decoder if a JPEG logo ever needs supporting.
  const { width: imgWidth, height: imgHeight } = readPngSize(data.logoPath);
  const logoWidth = (LOGO_HEIGHT / imgHeight) * imgWidth;
  doc.image(data.logoPath, left, top, { height: LOGO_HEIGHT });

  const textX = left + logoWidth + SPACING.brandGap;
  const textWidth = right - textX - DOCBOX_RESERVE;
  let leftY = top;
  if (data.rtn) {
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT.rtn)
      .fillColor(TEXT)
      .text(`RTN ${data.rtn}`, textX, leftY, { width: textWidth });
    leftY += FONT.rtn * LINE_HEIGHT;
  }
  if (data.addressLine) {
    doc
      .font('Helvetica')
      .fontSize(FONT.addr)
      .fillColor(TEXT_DIM)
      .text(data.addressLine, textX, leftY + SPACING.addrMarginTop, {
        width: textWidth,
      });
    leftY += SPACING.addrMarginTop + FONT.addr * LINE_HEIGHT * 2;
  }
  const leftHeight = Math.max(LOGO_HEIGHT, leftY - top);

  doc.font('Helvetica').fontSize(FONT.docMeta);
  const metaWidth = Math.max(
    doc.widthOfString(data.dateLine),
    doc.widthOfString(data.userLine),
  );
  doc.font('Courier-Bold').fontSize(FONT.docValue);
  const numberWidth = data.docNumber ? doc.widthOfString(data.docNumber) : 0;
  const boxContentWidth = Math.max(metaWidth, numberWidth, 70);
  const boxWidth = boxContentWidth + SPACING.docboxPaddingH * 2;
  const boxX = right - boxWidth;

  let boxY = top + SPACING.docboxPaddingV;
  doc
    .font('Helvetica')
    .fontSize(FONT.docLabel)
    .fillColor(TEXT_DIM)
    .text(data.docLabel.toUpperCase(), boxX + SPACING.docboxPaddingH, boxY, {
      width: boxContentWidth,
      align: 'right',
    });
  boxY += FONT.docLabel * LINE_HEIGHT;

  if (data.docNumber) {
    doc
      .font('Courier-Bold')
      .fontSize(FONT.docValue)
      .fillColor(ACCENT)
      .text(data.docNumber, boxX + SPACING.docboxPaddingH, boxY, {
        width: boxContentWidth,
        align: 'right',
      });
    boxY += FONT.docValue * LINE_HEIGHT;
  }

  doc
    .lineWidth(RULE_WIDTH)
    .strokeColor(RULE)
    .moveTo(boxX + SPACING.docboxPaddingH, boxY)
    .lineTo(boxX + boxWidth - SPACING.docboxPaddingH, boxY)
    .stroke();
  boxY += SPACING.docboxMetaPaddingTop;

  doc
    .font('Helvetica')
    .fontSize(FONT.docMeta)
    .fillColor(TEXT_DIM)
    .text(
      `${data.dateLine}\n${data.userLine}`,
      boxX + SPACING.docboxPaddingH,
      boxY,
      {
        width: boxContentWidth,
        align: 'right',
      },
    );
  boxY += FONT.docMeta * LINE_HEIGHT * 2;

  const boxHeight = boxY + SPACING.docboxPaddingV - top;
  doc
    .lineWidth(RULE_WIDTH)
    .strokeColor(ACCENT)
    .rect(boxX, top, boxWidth, boxHeight)
    .stroke();

  const headerHeight = Math.max(leftHeight, boxHeight);
  const ruleY = top + headerHeight + SPACING.headerPaddingBottom;
  doc
    .lineWidth(RULE_WIDTH)
    .strokeColor(ACCENT)
    .moveTo(left, ruleY)
    .lineTo(right, ruleY)
    .stroke();

  doc.fillColor(TEXT);
  return ruleY + SPACING.headerMarginBottom;
}

/** Serif accent h1, centered, optional gray subtitle below. */
export function drawTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  subtitle: string | null,
  left: number,
  right: number,
  top: number,
): number {
  const width = right - left;
  doc
    .font('Times-Bold')
    .fontSize(FONT.h1)
    .fillColor(ACCENT)
    .text(title, left, top, { width, align: 'center' });
  let y = top + FONT.h1 * LINE_HEIGHT + SPACING.h1MarginBottom;

  if (subtitle) {
    doc
      .font('Helvetica')
      .fontSize(FONT.subtitle)
      .fillColor(TEXT_DIM)
      .text(subtitle, left, y, { width, align: 'center' });
    y += FONT.subtitle * LINE_HEIGHT;
  }

  doc.fillColor(TEXT);
  return y + SPACING.subtitleMarginBottom;
}

export interface ScopePair {
  label: string;
  value: string;
}

/**
 * Single-line "Label: value · Label: value" strip with a soft background,
 * matching the template's .scope box. ponytail: fixed single-line height —
 * doesn't grow for a very long pair list, upgrade with doc.heightOfString()
 * if a real document ever overflows it.
 */
export function drawScope(
  doc: PDFKit.PDFDocument,
  pairs: ScopePair[],
  left: number,
  right: number,
  top: number,
): number {
  const width = right - left;
  const height = SPACING.scopePaddingV * 2 + FONT.scope * LINE_HEIGHT;

  doc
    .lineWidth(RULE_WIDTH)
    .rect(left, top, width, height)
    .fillAndStroke(SOFT, RULE);

  const x = left + SPACING.scopePaddingH;
  const y = top + SPACING.scopePaddingV;
  doc.fontSize(FONT.scope);

  pairs.forEach((pair, i) => {
    if (i === 0) {
      doc
        .font('Helvetica-Bold')
        .fillColor(TEXT)
        .text(`${pair.label}: `, x, y, { continued: true });
    } else {
      // Template uses `gap: 20px` between flex items, no separator glyph --
      // approximate that gap with plain spaces rather than inventing a "·"
      // the design doesn't have.
      doc
        .font('Helvetica-Bold')
        .fillColor(TEXT)
        .text(`    ${pair.label}: `, { continued: true });
    }
    const isLast = i === pairs.length - 1;
    doc
      .font('Helvetica')
      .fillColor(TEXT_DIM)
      .text(pair.value, { continued: !isLast });
  });

  doc.fillColor(TEXT);
  return top + height + SPACING.scopeMarginBottom;
}

export interface TableColumn {
  key: string;
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

const headerRowHeight = () =>
  Math.ceil(FONT.tableHeader * LINE_HEIGHT + SPACING.thPaddingV * 2);
const bodyRowHeight = () =>
  Math.ceil(FONT.tableBody * LINE_HEIGHT + SPACING.tdPaddingV * 2);

function drawTableHeaderRow(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  left: number,
  top: number,
): number {
  const rowHeight = headerRowHeight();
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

  let x = left;
  doc.lineWidth(RULE_WIDTH);
  for (const col of columns) {
    doc.rect(x, top, col.width, rowHeight).fillAndStroke(SOFT, RULE);
    x += col.width;
  }

  doc
    .lineWidth(THICK_RULE_WIDTH)
    .strokeColor(ACCENT)
    .moveTo(left, top)
    .lineTo(left + totalWidth, top)
    .stroke();

  x = left;
  doc.font('Helvetica-Bold').fontSize(FONT.tableHeader).fillColor(TEXT_DIM);
  for (const col of columns) {
    doc.text(
      col.header.toUpperCase(),
      x + SPACING.thPaddingH,
      top + SPACING.thPaddingV,
      {
        width: col.width - SPACING.thPaddingH * 2,
        align: col.align ?? 'left',
      },
    );
    x += col.width;
  }

  doc.fillColor(TEXT);
  return top + rowHeight;
}

/**
 * Declarative-column table: bordered cells, soft header background with a
 * 2px accent top border, uppercased header text. Pages when a row doesn't
 * fit, repeating the header row on the new page.
 */
export function drawTable(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  rows: Record<string, string>[],
  left: number,
  top: number,
): number {
  let cursor = drawTableHeaderRow(doc, columns, left, top);
  const rowHeight = bodyRowHeight();

  for (const row of rows) {
    if (cursor + rowHeight > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
      cursor = drawTableHeaderRow(doc, columns, left, PAGE_MARGIN);
    }

    let x = left;
    doc.lineWidth(RULE_WIDTH).strokeColor(RULE);
    for (const col of columns) {
      doc.rect(x, cursor, col.width, rowHeight).stroke();
      x += col.width;
    }

    x = left;
    doc.font('Helvetica').fontSize(FONT.tableBody).fillColor(TEXT);
    for (const col of columns) {
      doc.text(
        row[col.key] ?? '',
        x + SPACING.tdPaddingH,
        cursor + SPACING.tdPaddingV,
        {
          width: col.width - SPACING.tdPaddingH * 2,
          align: col.align ?? 'left',
        },
      );
      x += col.width;
    }

    cursor += rowHeight;
  }

  doc.fillColor(TEXT);
  return cursor;
}

export interface KeyValueRow {
  label: string;
  value: string;
}

/**
 * Stacked label/value rows in a single bordered box, each row separated by
 * a rule line (last row has none — the box's own border closes it off),
 * matching the template's .kv block used by Salida/Préstamo.
 */
export function drawKeyValues(
  doc: PDFKit.PDFDocument,
  rows: KeyValueRow[],
  left: number,
  right: number,
  top: number,
): number {
  const width = right - left;
  const rowHeight = Math.ceil(
    FONT.kvRow * LINE_HEIGHT + SPACING.kvRowPaddingV * 2,
  );
  const height = rowHeight * rows.length;

  doc
    .lineWidth(RULE_WIDTH)
    .strokeColor(RULE)
    .rect(left, top, width, height)
    .stroke();

  rows.forEach((row, i) => {
    const y = top + i * rowHeight + SPACING.kvRowPaddingV;
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT.kvLabel)
      .fillColor(TEXT_DIM)
      .text(row.label.toUpperCase(), left + SPACING.kvRowPaddingH, y, {
        width: width / 2,
      });
    doc
      .font('Helvetica')
      .fontSize(FONT.kvRow)
      .fillColor(TEXT)
      .text(row.value, left + width / 2, y, {
        width: width / 2 - SPACING.kvRowPaddingH,
        align: 'right',
      });

    if (i < rows.length - 1) {
      const dividerY = top + (i + 1) * rowHeight;
      doc
        .lineWidth(RULE_WIDTH)
        .strokeColor(RULE)
        .moveTo(left, dividerY)
        .lineTo(right, dividerY)
        .stroke();
    }
  });

  doc.fillColor(TEXT);
  return top + height + SPACING.kvMarginBottom;
}

export interface TotalsRow {
  label: string;
  value: string;
  grand?: boolean;
}

/**
 * Subtotal/tax rows in dim small text, grand total row with a 2px accent
 * rule above it and larger bold accent text.
 */
export function drawTotals(
  doc: PDFKit.PDFDocument,
  rows: TotalsRow[],
  left: number,
  right: number,
  top: number,
): number {
  let y = top;
  const labelWidth = (right - left) * 0.7;
  const valueWidth = right - left - labelWidth;

  for (const row of rows) {
    if (row.grand) {
      doc
        .lineWidth(THICK_RULE_WIDTH)
        .strokeColor(ACCENT)
        .moveTo(left, y)
        .lineTo(right, y)
        .stroke();
      y += SPACING.totalsGrandPaddingTop;
      doc.font('Helvetica-Bold').fontSize(FONT.totalsGrand).fillColor(ACCENT);
    } else {
      doc.font('Helvetica').fontSize(FONT.totalsRow).fillColor(TEXT_DIM);
    }

    // Template uses `justify-content: space-between`: label flush at the
    // left edge, value flush at the right edge, with the gap between them
    // left empty -- not the label right-aligned up against the value.
    doc.text(row.label, left, y, { width: labelWidth, align: 'left' });
    doc.text(row.value, left + labelWidth, y, {
      width: valueWidth,
      align: 'right',
    });

    y += row.grand
      ? FONT.totalsGrand * LINE_HEIGHT + SPACING.totalsRowPaddingV
      : FONT.totalsRow * LINE_HEIGHT + SPACING.totalsRowPaddingV;
  }

  doc.fillColor(TEXT);
  return y;
}

/**
 * One block per signer: a horizontal line with the role label below it
 * (the template's single-line signature block, not the old two-line
 * Name/Date layout).
 */
export function drawSignatures(
  doc: PDFKit.PDFDocument,
  labels: string[],
  left: number,
  right: number,
  top: number,
): number {
  const count = labels.length;
  const gap = SPACING.signaturesGap;
  const colWidth = (right - left - gap * (count - 1)) / count;
  const lineY = top + SPACING.sigLineMarginTop;

  labels.forEach((label, i) => {
    const x = left + i * (colWidth + gap);
    doc
      .lineWidth(RULE_WIDTH)
      .strokeColor(TEXT)
      .moveTo(x, lineY)
      .lineTo(x + colWidth, lineY)
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT.sigWho)
      .fillColor(TEXT_DIM)
      .text(label.toUpperCase(), x, lineY + SPACING.sigLineMarginBottom, {
        width: colWidth,
      });
  });

  doc.fillColor(TEXT);
  return lineY + SPACING.sigLineMarginBottom + FONT.sigWho * LINE_HEIGHT;
}

/** Rule divider, legal text on the left, page info + reference on the right. */
export function drawFooter(
  doc: PDFKit.PDFDocument,
  legalText: string,
  pageInfo: string,
  ref: string,
  left: number,
  right: number,
  top: number,
): number {
  doc
    .lineWidth(RULE_WIDTH)
    .strokeColor(RULE)
    .moveTo(left, top)
    .lineTo(right, top)
    .stroke();

  const y = top + SPACING.footerPaddingTop;
  const rightWidth = 140;
  // `top` deliberately sits inside the page's own bottom margin (that's the
  // point of a footer) — without an explicit `height`, PDFKit's .text() sees
  // y past page.maxY() (height - margins.bottom) and silently inserts a
  // whole extra page per call before drawing a single glyph. `height` tells
  // it "this is a fixed box, don't paginate", which is exactly what a
  // footer that lives below the normal content area needs.
  const footerTextHeight = FONT.footer * LINE_HEIGHT * 2;
  doc
    .font('Helvetica')
    .fontSize(FONT.footer)
    .fillColor(TEXT_DIM)
    .text(legalText, left, y, {
      width: right - left - rightWidth - 10,
      height: footerTextHeight,
    });
  doc.text(`${pageInfo}\n${ref}`, right - rightWidth, y, {
    width: rightWidth,
    align: 'right',
    height: footerTextHeight,
  });

  doc.fillColor(TEXT);
  return y + FONT.footer * LINE_HEIGHT * 2;
}
