import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PaginationDto, PaginatedResult, parsePagination, buildPaginationMeta } from '../common/dto';
import { warehouseFilter } from '../common/warehouse-access/warehouse-filter.util';
import { getPrismaErrorCode } from '../common/prisma-error.util';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDto: CreateWarehouseDto) {
    try {
      return await this.prisma.tenant().warehouse.create({
        data: createDto,
      });
    } catch (error: unknown) {
      if (getPrismaErrorCode(error) === 'P2002') {
        throw new ConflictException('Warehouse with this value already exists');
      }
      throw error;
    }
  }

  async findAll(
    pagination?: PaginationDto,
    warehouseIds?: string[] | null,
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = parsePagination(pagination);
    const where = warehouseFilter(warehouseIds, 'id');

    const [data, total] = await Promise.all([
      this.prisma.tenant().warehouse.findMany({
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
      this.prisma.tenant().warehouse.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const entity = await this.prisma.tenant().warehouse.findUnique({
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

  async update(id: string, updateDto: UpdateWarehouseDto) {
    try {
      return await this.prisma.tenant().warehouse.update({
        where: { id },
        data: updateDto,
      });
    } catch (error: unknown) {
      const code = getPrismaErrorCode(error);
      if (code === 'P2002') throw new ConflictException('Warehouse with this value already exists');
      if (code === 'P2025') throw new NotFoundException(`Warehouse with ID ${id} not found`);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.tenant().warehouse.delete({
        where: { id },
      });
    } catch (error: unknown) {
      if (getPrismaErrorCode(error) === 'P2025') {
        throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      throw error;
    }
  }

  async count(where?: Prisma.WarehouseWhereInput): Promise<number> {
    return this.prisma.tenant().warehouse.count({ where });
  }
}
