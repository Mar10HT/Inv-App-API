// receipt-components.ts reads the logo's PNG IHDR chunk directly (see its
// readPngSize() comment) instead of relying on pdfkit's untyped
// openImage() — fake a minimal PNG buffer with a known width/height so
// drawHeader() doesn't need a real file on disk.
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => {
    const buffer = Buffer.alloc(24);
    buffer.writeUInt32BE(1800, 16);
    buffer.writeUInt32BE(325, 20);
    return buffer;
  }),
}));

import {
  ACCENT,
  PAGE_MARGIN,
  RULE,
  SOFT,
  drawFooter,
  drawHeader,
  drawKeyValues,
  drawScope,
  drawSignatures,
  drawTable,
  drawTitle,
  drawTotals,
  type TableColumn,
} from './receipt-components';

// Minimal chainable mock of PDFKit's PDFDocument — same pattern as
// pdf-receipts.service.spec.ts's createMockDoc, extended with the drawing
// methods the kit uses that the service's render() never touched directly
// (rect/fillAndStroke/lineWidth/openImage/image/widthOfString).
function createMockDoc(pageHeight = 792) {
  const textCalls: unknown[] = [];
  const doc: Record<string, unknown> = {
    page: { width: 612, height: pageHeight },
    x: 0,
    y: 0,
    text: jest.fn((value: unknown) => {
      textCalls.push(value);
      return doc;
    }),
    widthOfString: jest.fn(() => 40),
    // Single-line height by default; individual tests override this to
    // simulate a wrapped multi-line value (see the "grows" tests below).
    heightOfString: jest.fn(() => 12),
  };
  for (const method of [
    'fontSize',
    'font',
    'fillColor',
    'strokeColor',
    'lineWidth',
    'moveTo',
    'lineTo',
    'stroke',
    'rect',
    'fillAndStroke',
    'fill',
    'image',
    'addPage',
  ]) {
    doc[method] = jest.fn(() => doc);
  }
  return { doc: doc as unknown as PDFKit.PDFDocument, raw: doc, textCalls };
}

// doc.rect(x, y, width, height) — reads the height (4th) argument of a
// recorded call without indexing into the mock's untyped `any[]` args.
function rectHeight(mock: jest.Mock, callIndex: number): number {
  const args = mock.mock.calls[callIndex] as unknown as [
    number,
    number,
    number,
    number,
  ];
  return args[3];
}

describe('receipt-components', () => {
  describe('drawHeader', () => {
    const baseData = {
      logoPath: '/fake/logo.png',
      rtn: '0801-1990-123456',
      addressLine:
        'Juticalpa, Olancho · +504 2785-0000 · contacto@olanchonet.com',
      docLabel: 'Venta Nº',
      docNumber: 'V-0001',
      dateLine: '06 oct 2026, 1:15 p.m.',
      userLine: 'Mario Herrera',
    };

    it('draws the logo, the fiscal text block, the docbox border and the bottom accent rule', () => {
      const { doc, raw, textCalls } = createMockDoc();

      const y = drawHeader(doc, baseData, 50, 562, 50);

      const [imgPath, imgX, imgY, imgOptions] = (raw.image as jest.Mock).mock
        .calls[0] as [string, number, number, { height: number }];
      expect(imgPath).toBe(baseData.logoPath);
      expect(imgX).toBe(50);
      expect(imgY).toBe(50);
      expect(imgOptions.height).toBeGreaterThan(0);
      expect(textCalls).toContain('RTN 0801-1990-123456');
      expect(textCalls).toContain(baseData.addressLine);
      expect(textCalls).toContain('VENTA Nº');
      expect(textCalls).toContain('V-0001');
      expect(textCalls).toContain(`${baseData.dateLine}\n${baseData.userLine}`);
      // docbox border + bottom header rule both stroke in accent.
      expect((raw.strokeColor as jest.Mock).mock.calls.flat()).toContain(
        ACCENT,
      );
      expect(raw.rect).toHaveBeenCalled();
      expect(y).toBeGreaterThan(50);
    });

    it('omits the docbox number row when docNumber is null (future report usage)', () => {
      const { doc, textCalls } = createMockDoc();

      drawHeader(doc, { ...baseData, docNumber: null }, 50, 562, 50);

      expect(textCalls).not.toContain('V-0001');
    });
  });

  describe('drawTitle', () => {
    it('renders a centered accent h1 and an optional dim subtitle', () => {
      const { doc, raw, textCalls } = createMockDoc();

      const y = drawTitle(
        doc,
        'Recibo de Venta',
        'Comprobante de venta',
        50,
        562,
        100,
      );

      expect(textCalls).toContain('Recibo de Venta');
      expect(textCalls).toContain('Comprobante de venta');
      expect((raw.font as jest.Mock).mock.calls.flat()).toContain('Times-Bold');
      expect((raw.fillColor as jest.Mock).mock.calls.flat()).toContain(ACCENT);
      expect(y).toBeGreaterThan(100);
    });

    it('skips the subtitle line entirely when null', () => {
      const { doc, textCalls } = createMockDoc();

      drawTitle(doc, 'Recibo de Venta', null, 50, 562, 100);

      expect(textCalls).toEqual(['Recibo de Venta']);
    });
  });

  describe('drawScope', () => {
    it('fills a soft bordered strip with bold labels and dim values', () => {
      const { doc, raw, textCalls } = createMockDoc();

      const y = drawScope(
        doc,
        [
          { label: 'Cliente', value: 'Juan Pérez' },
          { label: 'Forma de pago', value: 'Contado' },
        ],
        50,
        562,
        200,
      );

      expect(raw.fillAndStroke).toHaveBeenCalledWith(SOFT, RULE);
      expect(textCalls).toContain('Cliente: ');
      expect(textCalls).toContain('Juan Pérez');
      expect(textCalls).toContain('    Forma de pago: ');
      expect(textCalls).toContain('Contado');
      expect(y).toBeGreaterThan(200);
    });
  });

  describe('drawTable', () => {
    const columns: TableColumn[] = [
      { key: 'item', header: 'Producto', width: 300, align: 'left' },
      { key: 'qty', header: 'Cant.', width: 212, align: 'right' },
    ];

    it('uppercases header text and draws one bordered row per item', () => {
      const { doc, raw, textCalls } = createMockDoc();

      const y = drawTable(
        doc,
        columns,
        [
          { item: 'Router TP-Link AX3000', qty: '1' },
          { item: 'Cable UTP Cat6 (m)', qty: '30' },
        ],
        50,
        100,
      );

      expect(textCalls).toContain('PRODUCTO');
      expect(textCalls).toContain('CANT.');
      expect(textCalls).toContain('Router TP-Link AX3000');
      expect(textCalls).toContain('Cable UTP Cat6 (m)');
      expect(raw.rect).toHaveBeenCalled();
      expect(y).toBeGreaterThan(100);
    });

    it('adds a page and repeats the header row when a row does not fit', () => {
      const { doc, raw } = createMockDoc(200); // tiny page height forces a break fast
      const rows = Array.from({ length: 10 }, (_, i) => ({
        item: `Item ${i}`,
        qty: String(i),
      }));

      drawTable(doc, columns, rows, 50, PAGE_MARGIN);

      expect(raw.addPage).toHaveBeenCalled();
    });

    it('grows a row height to fit a wrapped long cell instead of a fixed single line', () => {
      const short = createMockDoc();
      const long = createMockDoc();
      (long.raw.heightOfString as jest.Mock).mockReturnValue(24); // simulates a 2-line wrap

      drawTable(short.doc, columns, [{ item: 'Router', qty: '1' }], 50, 100);
      drawTable(
        long.doc,
        columns,
        [{ item: 'A very long product name plus service tag', qty: '1' }],
        50,
        100,
      );

      // rect is called once per column for the header row, then once per column
      // for the body row — index -2 (the 'item' column) is the body row.
      const shortRect = short.raw.rect as jest.Mock;
      const longRect = long.raw.rect as jest.Mock;
      expect(
        rectHeight(longRect, longRect.mock.calls.length - 2),
      ).toBeGreaterThan(rectHeight(shortRect, shortRect.mock.calls.length - 2));
    });
  });

  describe('drawKeyValues', () => {
    it('draws an outer border and a divider between rows but not after the last one', () => {
      const { doc, raw, textCalls } = createMockDoc();

      const y = drawKeyValues(
        doc,
        [
          { label: 'Motivo', value: 'Equipo dañado' },
          { label: 'Cantidad', value: '2' },
        ],
        50,
        562,
        100,
      );

      expect(textCalls).toContain('MOTIVO');
      expect(textCalls).toContain('Equipo dañado');
      expect(textCalls).toContain('CANTIDAD');
      expect(textCalls).toContain('2');
      // One divider between the 2 rows, plus the outer border rect.
      expect((raw.moveTo as jest.Mock).mock.calls.length).toBe(1);
      expect(raw.rect).toHaveBeenCalled();
      expect(y).toBeGreaterThan(100);
    });

    it('grows the row height to fit a wrapped long value instead of a fixed single line', () => {
      const short = createMockDoc();
      const long = createMockDoc();
      (long.raw.heightOfString as jest.Mock).mockReturnValue(24); // simulates a 2-line wrap

      drawKeyValues(
        short.doc,
        [{ label: 'Motivo', value: 'Consumo interno' }],
        50,
        562,
        100,
      );
      drawKeyValues(
        long.doc,
        [
          {
            label: 'Producto',
            value: 'A very long product name plus service tag',
          },
        ],
        50,
        562,
        100,
      );

      const shortHeight = rectHeight(short.raw.rect as jest.Mock, 0);
      const longHeight = rectHeight(long.raw.rect as jest.Mock, 0);
      expect(longHeight).toBeGreaterThan(shortHeight);
    });
  });

  describe('drawTotals', () => {
    it('draws a thicker accent rule and larger bold text for the grand-total row', () => {
      const { doc, raw, textCalls } = createMockDoc();

      const y = drawTotals(
        doc,
        [
          { label: 'Subtotal', value: 'L. 3,005.00' },
          { label: 'Impuesto (ISV)', value: 'L. 367.50' },
          { label: 'Total', value: 'L. 3,372.50', grand: true },
        ],
        50,
        562,
        300,
      );

      expect(textCalls).toContain('Total');
      expect(textCalls).toContain('L. 3,372.50');
      expect((raw.strokeColor as jest.Mock).mock.calls.flat()).toContain(
        ACCENT,
      );
      expect((raw.lineWidth as jest.Mock).mock.calls.flat()).toContain(1.5);
      expect(y).toBeGreaterThan(300);
    });
  });

  describe('drawSignatures', () => {
    it('draws one line per label with the uppercased role below it', () => {
      const { doc, raw, textCalls } = createMockDoc();

      const y = drawSignatures(
        doc,
        ['Entregado por', 'Recibido por'],
        50,
        562,
        400,
      );

      expect(raw.moveTo).toHaveBeenCalledTimes(2);
      expect(textCalls).toContain('ENTREGADO POR');
      expect(textCalls).toContain('RECIBIDO POR');
      expect(y).toBeGreaterThan(400);
    });

    it('splits evenly for 3 signers (Elaborado/Revisado/Aprobado)', () => {
      const { doc, raw } = createMockDoc();

      drawSignatures(
        doc,
        ['Elaborado por', 'Revisado por', 'Aprobado por'],
        50,
        562,
        400,
      );

      expect(raw.moveTo).toHaveBeenCalledTimes(3);
    });
  });

  describe('drawFooter', () => {
    it('draws a rule divider, the legal text and the page info + ref block', () => {
      const { doc, raw, textCalls } = createMockDoc();

      const y = drawFooter(
        doc,
        'Documento generado automáticamente por Obsid.',
        'Página 1 de 1',
        'Ref. OBS-7F3A21',
        50,
        562,
        700,
      );

      expect(textCalls).toContain(
        'Documento generado automáticamente por Obsid.',
      );
      expect(textCalls).toContain('Página 1 de 1\nRef. OBS-7F3A21');
      expect(raw.moveTo).toHaveBeenCalledWith(50, 700);
      expect(y).toBeGreaterThan(700);
    });
  });
});
