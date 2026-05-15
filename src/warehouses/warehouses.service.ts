import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PaginationDto, PaginatedResult, parsePagination, buildPaginationMeta } from '../common/dto';
import { warehouseFilter } from '../common/warehouse-access/warehouse-filter.util';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(createDto: CreateWarehouseDto, userId?: string) {
    let warehouse;
    try {
      warehouse = await this.prisma.warehouse.create({
        data: createDto,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Warehouse with this value already exists');
      }
      throw error;
    }

    await this.auditService
      .log({
        action: 'CREATE',
        entity: 'Warehouse',
        entityId: warehouse.id,
        userId,
        changes: {
          after: {
            name: warehouse.name,
            location: warehouse.location,
            description: warehouse.description,
            isActive: warehouse.isActive,
            managerId: warehouse.managerId,
          },
        },
      })
      .catch(() => undefined);

    return warehouse;
  }

  async findAll(
    pagination?: PaginationDto,
    warehouseIds?: string[] | null,
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = parsePagination(pagination);
    const where = warehouseFilter(warehouseIds, 'id');

    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          manager: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: {
              inventoryItems: true,
            },
          },
        },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const entity = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        manager: {
          select: { id: true, name: true, email: true },
        },
        inventoryItems: true,
        _count: {
          select: {
            inventoryItems: true,
          },
        },
      },
    });

    if (!entity) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }

    return entity;
  }

  async update(id: string, updateDto: UpdateWarehouseDto, userId?: string) {
    const before = await this.prisma.warehouse.findUnique({ where: { id } });

    let warehouse;
    try {
      warehouse = await this.prisma.warehouse.update({
        where: { id },
        data: updateDto,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Warehouse with this value already exists');
        if (error.code === 'P2025') throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      throw error;
    }

    await this.auditService
      .log({
        action: 'UPDATE',
        entity: 'Warehouse',
        entityId: id,
        userId,
        changes: {
          before: before
            ? {
                name: before.name,
                location: before.location,
                description: before.description,
                isActive: before.isActive,
                managerId: before.managerId,
              }
            : undefined,
          after: {
            name: warehouse.name,
            location: warehouse.location,
            description: warehouse.description,
            isActive: warehouse.isActive,
            managerId: warehouse.managerId,
          },
          fields: Object.keys(updateDto),
        },
      })
      .catch(() => undefined);

    return warehouse;
  }

  async remove(id: string, userId?: string): Promise<void> {
    const before = await this.prisma.warehouse.findUnique({ where: { id } });

    try {
      await this.prisma.warehouse.delete({
        where: { id },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      throw error;
    }

    await this.auditService
      .log({
        action: 'DELETE',
        entity: 'Warehouse',
        entityId: id,
        userId,
        changes: {
          before: before
            ? {
                name: before.name,
                location: before.location,
                description: before.description,
                managerId: before.managerId,
              }
            : undefined,
        },
      })
      .catch(() => undefined);
  }

  async count(where?: Prisma.WarehouseWhereInput): Promise<number> {
    return this.prisma.warehouse.count({ where });
  }
}
