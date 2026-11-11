import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type Service } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { ServicesService } from './services.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('ServicesService', () => {
  let service: ServicesService;
  let prisma: DeepMockProxy<PrismaService>;

  const installation = {
    id: 'service-1',
    name: 'Instalación de fibra',
    description: null,
    price: new Prisma.Decimal('850.00'),
    currency: 'HNL',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Service;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logSafe: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a service with its suggested price', async () => {
    prisma.service.create.mockResolvedValue(installation);

    await service.create({
      name: 'Instalación de fibra',
      price: 850,
      currency: 'HNL',
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.service.create).toHaveBeenCalledWith({
      data: { name: 'Instalación de fibra', price: 850, currency: 'HNL' },
    });
  });

  it('refuses a second service with the same name', async () => {
    prisma.service.create.mockRejectedValue(prismaError('P2002'));

    await expect(
      service.create({ name: 'Instalación de fibra' }),
    ).rejects.toThrow(ConflictException);
  });

  it('lists services by name', async () => {
    prisma.service.findMany.mockResolvedValue([installation]);
    prisma.service.count.mockResolvedValue(1);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data).toEqual([installation]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });

  it('deletes a service no sale uses', async () => {
    prisma.service.findUnique.mockResolvedValue(installation);
    prisma.service.delete.mockResolvedValue(installation);

    await service.remove('service-1', 'user-1');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.service.delete).toHaveBeenCalledWith({
      where: { id: 'service-1' },
    });
  });

  it('refuses to delete a service a sale uses, saying so', async () => {
    prisma.service.findUnique.mockResolvedValue(installation);
    // The sale line's foreign key is onDelete: Restrict
    prisma.service.delete.mockRejectedValue(prismaError('P2003'));

    await expect(service.remove('service-1', 'user-1')).rejects.toMatchObject({
      response: {
        code: 'SERVICE_IN_USE',
        params: { name: 'Instalación de fibra' },
      },
    });
  });

  it('reports a missing service as not found', async () => {
    prisma.service.findUnique.mockResolvedValue(null);
    prisma.service.delete.mockRejectedValue(prismaError('P2025'));

    await expect(service.remove('missing', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
