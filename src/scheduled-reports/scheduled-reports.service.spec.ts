import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReportFrequency, ReportType } from '@prisma/client';
import { ScheduledReportsService } from './scheduled-reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { EmailService } from '../email/email.service';

describe('ScheduledReportsService', () => {
  let service: ScheduledReportsService;
  let prisma: any;
  let reportsService: any;
  let emailService: any;

  const mockReport = {
    id: 'report-1',
    userId: 'user-1',
    reportType: ReportType.INVENTORY,
    frequency: ReportFrequency.DAILY,
    recipientEmails: 'a@test.com, b@test.com',
    warehouseId: null,
    locale: 'es',
    isActive: true,
    nextSendAt: new Date('2026-07-08T06:00:00.000Z'),
    lastSentAt: null,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      scheduledReport: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    reportsService = {
      generateInventoryExcel: jest.fn().mockResolvedValue(Buffer.from('inv')),
      generateLowStockReport: jest.fn().mockResolvedValue(Buffer.from('low')),
      generateTransactionsReport: jest
        .fn()
        .mockResolvedValue(Buffer.from('tx')),
      generateLoansReport: jest.fn().mockResolvedValue(Buffer.from('loans')),
      generateTransferRequestsReport: jest
        .fn()
        .mockResolvedValue(Buffer.from('transfers')),
      generateStockTakeReport: jest
        .fn()
        .mockResolvedValue(Buffer.from('stocktake')),
      generateDischargesReport: jest
        .fn()
        .mockResolvedValue(Buffer.from('discharges')),
    };

    emailService = {
      sendEmailWithAttachment: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportsService, useValue: reportsService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<ScheduledReportsService>(ScheduledReportsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const baseDto = () => ({
      reportType: ReportType.INVENTORY,
      frequency: ReportFrequency.DAILY,
      recipientEmails: 'a@test.com',
    });

    it('creates a scheduled report with a computed nextSendAt', async () => {
      prisma.scheduledReport.create.mockResolvedValue(mockReport);

      const result = await service.create(baseDto() as any, 'user-1');

      expect(result).toEqual(mockReport);
      expect(prisma.scheduledReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          reportType: ReportType.INVENTORY,
          frequency: ReportFrequency.DAILY,
          recipientEmails: 'a@test.com',
          warehouseId: null,
          locale: 'es',
          nextSendAt: expect.any(Date),
        }),
      });
    });

    it('defaults warehouseId to null and locale to "es" when omitted', async () => {
      prisma.scheduledReport.create.mockResolvedValue(mockReport);

      await service.create(baseDto() as any, 'user-1');

      const data = prisma.scheduledReport.create.mock.calls[0][0].data;
      expect(data.warehouseId).toBeNull();
      expect(data.locale).toBe('es');
    });

    it('preserves an explicit warehouseId and locale', async () => {
      prisma.scheduledReport.create.mockResolvedValue(mockReport);

      await service.create(
        { ...baseDto(), warehouseId: 'wh-1', locale: 'en' } as any,
        'user-1',
      );

      const data = prisma.scheduledReport.create.mock.calls[0][0].data;
      expect(data.warehouseId).toBe('wh-1');
      expect(data.locale).toBe('en');
    });

    it.each([
      [ReportFrequency.DAILY, 1],
      [ReportFrequency.WEEKLY, 7],
      [ReportFrequency.MONTHLY, null],
    ])(
      'computes nextSendAt at 06:00 UTC for %s frequency',
      async (frequency, dayOffset) => {
        prisma.scheduledReport.create.mockResolvedValue(mockReport);
        jest
          .useFakeTimers()
          .setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

        try {
          await service.create({ ...baseDto(), frequency } as any, 'user-1');

          const data = prisma.scheduledReport.create.mock.calls[0][0].data;
          const nextSendAt: Date = data.nextSendAt;
          expect(nextSendAt.getUTCHours()).toBe(6);
          expect(nextSendAt.getUTCMinutes()).toBe(0);

          if (frequency === ReportFrequency.DAILY) {
            expect(nextSendAt.getUTCDate()).toBe(8);
          } else if (frequency === ReportFrequency.WEEKLY) {
            expect(nextSendAt.getUTCDate()).toBe(14);
          } else {
            expect(nextSendAt.getUTCMonth()).toBe(7); // August (0-indexed)
          }
        } finally {
          jest.useRealTimers();
        }
      },
    );
  });

  describe('findAllForUser', () => {
    it('returns non-deleted reports for the user ordered by newest first', async () => {
      prisma.scheduledReport.findMany.mockResolvedValue([mockReport]);

      const result = await service.findAllForUser('user-1');

      expect(result).toEqual([mockReport]);
      expect(prisma.scheduledReport.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        include: { warehouse: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the report scoped to the owning user', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(mockReport);

      const result = await service.findOne('report-1', 'user-1');

      expect(result).toEqual(mockReport);
      expect(prisma.scheduledReport.findFirst).toHaveBeenCalledWith({
        where: { id: 'report-1', userId: 'user-1', deletedAt: null },
      });
    });

    it('throws NotFoundException when no matching report exists', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates fields without recomputing nextSendAt when frequency is unchanged', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(mockReport);
      prisma.scheduledReport.update.mockResolvedValue({
        ...mockReport,
        recipientEmails: 'new@test.com',
      });

      const result = await service.update(
        'report-1',
        { recipientEmails: 'new@test.com' } as any,
        'user-1',
      );

      expect(result.recipientEmails).toBe('new@test.com');
      expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: { recipientEmails: 'new@test.com' },
      });
    });

    it('recomputes nextSendAt when frequency changes', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(mockReport);
      prisma.scheduledReport.update.mockResolvedValue({
        ...mockReport,
        frequency: ReportFrequency.WEEKLY,
      });

      await service.update(
        'report-1',
        { frequency: ReportFrequency.WEEKLY } as any,
        'user-1',
      );

      const data = prisma.scheduledReport.update.mock.calls[0][0].data;
      expect(data.frequency).toBe(ReportFrequency.WEEKLY);
      expect(data.nextSendAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when the report does not belong to the user', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          'report-1',
          { recipientEmails: 'x@test.com' } as any,
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('marks the report as deleted', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(mockReport);
      prisma.scheduledReport.update.mockResolvedValue({
        ...mockReport,
        deletedAt: new Date(),
      });

      await service.softDelete('report-1', 'user-1');

      expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('throws NotFoundException when the report does not belong to the user', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(service.softDelete('report-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });
  });

  describe('sendNow', () => {
    it('generates and sends the report, then stamps lastSentAt', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(mockReport);
      prisma.scheduledReport.update.mockResolvedValue({
        ...mockReport,
        lastSentAt: new Date(),
      });

      await service.sendNow('report-1', 'user-1');

      expect(reportsService.generateInventoryExcel).toHaveBeenCalledWith(
        undefined,
        null,
        'es',
      );
      expect(emailService.sendEmailWithAttachment).toHaveBeenCalledTimes(2);
      expect(emailService.sendEmailWithAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@test.com',
          attachments: [
            expect.objectContaining({
              filename: expect.stringContaining('inventario_'),
            }),
          ],
        }),
      );
      expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: { lastSentAt: expect.any(Date) },
      });
    });

    it('scopes report generation to the warehouse when one is set', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue({
        ...mockReport,
        warehouseId: 'wh-1',
        reportType: ReportType.LOW_STOCK,
        recipientEmails: 'only@test.com',
      });
      prisma.scheduledReport.update.mockResolvedValue(mockReport);

      await service.sendNow('report-1', 'user-1');

      expect(reportsService.generateLowStockReport).toHaveBeenCalledWith(
        ['wh-1'],
        'es',
      );
    });

    it.each([
      [ReportType.TRANSACTIONS, 'generateTransactionsReport'],
      [ReportType.LOANS, 'generateLoansReport'],
      [ReportType.TRANSFERS, 'generateTransferRequestsReport'],
      [ReportType.STOCK_TAKES, 'generateStockTakeReport'],
      [ReportType.DISCHARGES, 'generateDischargesReport'],
    ] as const)(
      'dispatches %s to the matching report generator',
      async (reportType, method) => {
        prisma.scheduledReport.findFirst.mockResolvedValue({
          ...mockReport,
          reportType,
        });
        prisma.scheduledReport.update.mockResolvedValue(mockReport);

        await service.sendNow('report-1', 'user-1');

        expect(reportsService[method]).toHaveBeenCalled();
      },
    );

    it('throws when the report type is unknown', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue({
        ...mockReport,
        reportType: 'BOGUS',
      });

      await expect(service.sendNow('report-1', 'user-1')).rejects.toThrow(
        'Unknown report type: BOGUS',
      );
      expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the report does not belong to the user', async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(service.sendNow('report-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(emailService.sendEmailWithAttachment).not.toHaveBeenCalled();
    });
  });

  describe('runDailyCheck', () => {
    it('sends and reschedules every due, active, non-deleted report', async () => {
      const dueReport = { ...mockReport, id: 'report-1' };
      prisma.scheduledReport.findMany.mockResolvedValue([dueReport]);
      prisma.scheduledReport.update.mockResolvedValue(dueReport);

      await service.runDailyCheck();

      expect(prisma.scheduledReport.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          deletedAt: null,
          nextSendAt: { lte: expect.any(Date) },
        },
      });
      expect(emailService.sendEmailWithAttachment).toHaveBeenCalledTimes(2);
      expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          lastSentAt: expect.any(Date),
          nextSendAt: expect.any(Date),
        },
      });
    });

    it('continues processing remaining reports when one fails', async () => {
      const failingReport = { ...mockReport, id: 'report-fail' };
      const okReport = { ...mockReport, id: 'report-ok' };
      prisma.scheduledReport.findMany.mockResolvedValue([
        failingReport,
        okReport,
      ]);
      reportsService.generateInventoryExcel
        .mockRejectedValueOnce(new Error('generation failed'))
        .mockResolvedValueOnce(Buffer.from('inv'));
      prisma.scheduledReport.update.mockResolvedValue(okReport);

      await service.runDailyCheck();

      expect(prisma.scheduledReport.update).toHaveBeenCalledTimes(1);
      expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
        where: { id: 'report-ok' },
        data: {
          lastSentAt: expect.any(Date),
          nextSendAt: expect.any(Date),
        },
      });
    });

    it('does nothing when no reports are due', async () => {
      prisma.scheduledReport.findMany.mockResolvedValue([]);

      await service.runDailyCheck();

      expect(emailService.sendEmailWithAttachment).not.toHaveBeenCalled();
      expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });
  });
});
