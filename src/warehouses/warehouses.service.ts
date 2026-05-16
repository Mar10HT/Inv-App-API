import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma, Warehouse } from '@prisma/client';
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

  private normalizeManagerId(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return value;
  }

  private async assertManagerExists(managerId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('Manager user not found');
  }

  async create(createDto: CreateWarehouseDto, userId?: string): Promise<Warehouse> {
    const managerId = this.normalizeManagerId(createDto.managerId);
    if (managerId) await this.assertManagerExists(managerId);

    const { managerId: _ignored, ...rest } = createDto;
    void _ignored;

    let warehouse: Warehouse;
    try {
      warehouse = await this.prisma.$transaction(async (tx) => {
        const created = await tx.warehouse.create({
          data: { ...rest, managerId: managerId ?? null },
        });
        if (managerId) {
          await tx.userWarehouse.upsert({
            where: { userId_warehouseId: { userId: managerId, warehouseId: created.id } },
            create: { userId: managerId, warehouseId: created.id },
            update: {},
          });
        }
        return created;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Warehouse with this value already exists');
      }
      throw error;
    }

    this.auditService.logSafe({
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
    });

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

  async update(id: string, updateDto: UpdateWarehouseDto, userId?: string): Promise<Warehouse> {
    const before = await this.prisma.warehouse.findUnique({ where: { id } });

    const managerIdProvided = Object.prototype.hasOwnProperty.call(updateDto, 'managerId');
    const managerId = managerIdProvided ? this.normalizeManagerId(updateDto.managerId) : undefined;
    if (managerId) await this.assertManagerExists(managerId);

    const { managerId: _ignored, ...rest } = updateDto;
    void _ignored;
    const data: Prisma.WarehouseUpdateInput = { ...rest };
    if (managerIdProvided) {
      data.manager = managerId
        ? { connect: { id: managerId } }
        : { disconnect: true };
    }

    let warehouse: Warehouse;
    try {
      warehouse = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.warehouse.update({ where: { id }, data });
        if (managerIdProvided && managerId) {
          await tx.userWarehouse.upsert({
            where: { userId_warehouseId: { userId: managerId, warehouseId: id } },
            create: { userId: managerId, warehouseId: id },
            update: {},
          });
        }
        return updated;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Warehouse with this value already exists');
        if (error.code === 'P2025') throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      throw error;
    }

    this.auditService.logSafe({
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
    });

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

    this.auditService.logSafe({
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
    });
  }

  async count(where?: Prisma.WarehouseWhereInput): Promise<number> {
    return this.prisma.warehouse.count({ where });
  }
}
