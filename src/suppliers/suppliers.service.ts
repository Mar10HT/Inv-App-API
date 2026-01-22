import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginationDto, PaginatedResult } from '../common/dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async create(createSupplierDto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: createSupplierDto,
    });
  }

  async findAll(pagination?: PaginationDto): Promise<PaginatedResult<any>> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
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
      this.prisma.supplier.count(),
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
    const supplier = await this.prisma.supplier.findUnique({
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

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    return supplier;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    try {
      return await this.prisma.supplier.update({
        where: { id },
        data: updateSupplierDto,
      });
    } catch (error) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.supplier.delete({
        where: { id },
      });
    } catch (error) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
  }
}
