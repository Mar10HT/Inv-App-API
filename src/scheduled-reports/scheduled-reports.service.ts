import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { EmailService } from '../email/email.service';
import { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/create-scheduled-report.dto';
import { ReportFrequency, ReportType, ScheduledReport } from '@prisma/client';

@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
    private emailService: EmailService,
  ) {}

  async create(dto: CreateScheduledReportDto, userId: string): Promise<ScheduledReport> {
    return this.prisma.tenant().scheduledReport.create({
      data: {
        userId,
        reportType: dto.reportType,
        frequency: dto.frequency,
        recipientEmails: dto.recipientEmails,
        warehouseId: dto.warehouseId || null,
        locale: dto.locale || 'es',
        nextSendAt: this.computeNextSendAt(dto.frequency),
      },
    });
  }

  async findAllForUser(userId: string): Promise<ScheduledReport[]> {
    return this.prisma.tenant().scheduledReport.findMany({
      where: { userId, deletedAt: null },
      include: { warehouse: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string): Promise<ScheduledReport> {
    const report = await this.prisma.tenant().scheduledReport.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!report) throw new NotFoundException(`Scheduled report ${id} not found`);
    return report;
  }

  async update(id: string, dto: UpdateScheduledReportDto, userId: string): Promise<ScheduledReport> {
    await this.findOne(id, userId);

    const data = {
      ...dto,
      ...(dto.frequency ? { nextSendAt: this.computeNextSendAt(dto.frequency) } : {}),
    };

    return this.prisma.tenant().scheduledReport.update({ where: { id }, data });
  }

  async softDelete(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId);
    await this.prisma.tenant().scheduledReport.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async sendNow(id: string, userId: string): Promise<void> {
    // findOne enforces ownership — throws 404 if report belongs to another user
    const report = await this.findOne(id, userId);
    await this.generateAndSend(report);
    await this.prisma.tenant().scheduledReport.update({
      where: { id },
      data: { lastSentAt: new Date() },
    });
  }

  @Cron('0 6 * * *')
  async runDailyCheck(): Promise<void> {
    // Cron iterates scheduled reports across every org. Uses prisma directly
    // to bypass the tenant extension — no CLS scope here. Phase 7 release may
    // refactor this to per-org cron runs so the extension stays on, but for
    // now a cross-org scan is the simplest correct behavior.
    const due = await this.prisma.scheduledReport.findMany({
      where: { isActive: true, deletedAt: null, nextSendAt: { lte: new Date() } },
    });

    for (const report of due) {
      try {
        await this.generateAndSend(report);
        await this.prisma.scheduledReport.update({
          where: { id: report.id },
          data: {
            lastSentAt: new Date(),
            nextSendAt: this.computeNextSendAt(report.frequency),
          },
        });
      } catch (err) {
        this.logger.error(`Scheduled report ${report.id} failed: ${err.message}`);
      }
    }
  }

  private async generateAndSend(report: ScheduledReport): Promise<void> {
    const locale = (report.locale === 'en' ? 'en' : 'es') as 'en' | 'es';
    const warehouseIds = report.warehouseId ? [report.warehouseId] : null;
    let buffer: Buffer;
    let filename: string;
    const ts = new Date().toISOString().slice(0, 10);

    switch (report.reportType) {
      case ReportType.INVENTORY:
        buffer = await this.reportsService.generateInventoryExcel(undefined, warehouseIds, locale);
        filename = `inventario_${ts}.xlsx`;
        break;
      case ReportType.LOW_STOCK:
        buffer = await this.reportsService.generateLowStockReport(warehouseIds, locale);
        filename = `stock_bajo_${ts}.xlsx`;
        break;
      case ReportType.TRANSACTIONS:
        buffer = await this.reportsService.generateTransactionsReport(undefined, undefined, warehouseIds, locale);
        filename = `transacciones_${ts}.xlsx`;
        break;
      case ReportType.LOANS:
        buffer = await this.reportsService.generateLoansReport(warehouseIds, locale);
        filename = `prestamos_${ts}.xlsx`;
        break;
      case ReportType.TRANSFERS:
        buffer = await this.reportsService.generateTransferRequestsReport(warehouseIds, locale);
        filename = `transferencias_${ts}.xlsx`;
        break;
      case ReportType.STOCK_TAKES:
        buffer = await this.reportsService.generateStockTakeReport(warehouseIds, locale);
        filename = `conteo_fisico_${ts}.xlsx`;
        break;
      case ReportType.DISCHARGES:
        buffer = await this.reportsService.generateDischargesReport(warehouseIds, locale);
        filename = `bajas_${ts}.xlsx`;
        break;
      default:
        throw new Error(`Unknown report type: ${report.reportType}`);
    }

    const emails = report.recipientEmails.split(',').map(e => e.trim()).filter(Boolean);
    for (const email of emails) {
      await this.emailService.sendEmailWithAttachment({
        to: email,
        subject: `Obsid — Reporte programado: ${report.reportType} (${ts})`,
        html: `<p>Se adjunta el reporte programado <strong>${report.reportType}</strong> generado el ${ts}.</p>
               <p><em>Generado automáticamente por Obsid.</em></p>`,
        attachments: [{ filename, content: buffer }],
      });
    }
  }

  private computeNextSendAt(frequency: ReportFrequency): Date {
    const next = new Date();
    next.setUTCHours(6, 0, 0, 0);

    switch (frequency) {
      case ReportFrequency.DAILY:
        next.setUTCDate(next.getUTCDate() + 1);
        break;
      case ReportFrequency.WEEKLY:
        next.setUTCDate(next.getUTCDate() + 7);
        break;
      case ReportFrequency.MONTHLY:
        next.setUTCMonth(next.getUTCMonth() + 1);
        break;
    }

    return next;
  }
}
