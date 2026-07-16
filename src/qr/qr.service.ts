import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';

export interface QrCodeData {
  type: 'LOAN_SEND' | 'LOAN_RETURN' | 'TRANSFER';
  id: string;
  code: string;
}

const QR_CODE_TYPES = new Set<QrCodeData['type']>([
  'LOAN_SEND',
  'LOAN_RETURN',
  'TRANSFER',
]);

/** Runtime guard verifying scanned/parsed JSON actually matches the expected QR payload shape. */
function isQrCodeData(value: unknown): value is QrCodeData {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === 'string' &&
    QR_CODE_TYPES.has(candidate.type as QrCodeData['type']) &&
    typeof candidate.id === 'string' &&
    typeof candidate.code === 'string'
  );
}

@Injectable()
export class QrService {
  /**
   * Generate a unique QR code string
   */
  generateCode(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate QR code as base64 data URL
   */
  async generateQrDataUrl(data: QrCodeData): Promise<string> {
    const payload = JSON.stringify(data);
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
    });
  }

  /**
   * Generate QR code as PNG buffer
   */
  async generateQrBuffer(data: QrCodeData): Promise<Buffer> {
    const payload = JSON.stringify(data);
    return QRCode.toBuffer(payload, {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: 300,
      margin: 2,
    });
  }

  /**
   * Generate QR code from a plain URL string as base64 data URL
   */
  async generateUrlQrDataUrl(url: string): Promise<string> {
    return QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
    });
  }

  /**
   * Parse QR code data from scanned string
   */
  parseQrData(scannedData: string): QrCodeData | null {
    try {
      const data: unknown = JSON.parse(scannedData);
      if (isQrCodeData(data)) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }
}
