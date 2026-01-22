import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PaginationDto, PaginatedResult } from '../common/dto';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  async create(createWarehouseDto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: createWarehouseDto,
    });
  }

  async findAll(pagination?: PaginationDto): Promise<PaginatedResult<any>> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: pagination?.sortOrder || 'desc',
        },
        include: {
          _count: {
            select: {
              inventoryItems: true,
            },
          },
        },
      }),
      this.prisma.warehouse.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        inventoryItems: true,
        _count: {
          select: {
            inventoryItems: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }

    return warehouse;
  }

  async update(id: string, updateWarehouseDto: UpdateWarehouseDto) {
    try {
      return await this.prisma.warehouse.update({
        where: { id },
        data: updateWarehouseDto,
      });
    } catch (error) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.warehouse.delete({
        where: { id },
      });
    } catch (error) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }
  }
}
