import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto, PaginatedResult } from '../dto';

export interface BaseRepositoryOptions {
  modelName: string;
  defaultOrderBy?: Record<string, 'asc' | 'desc'>;
  findAllInclude?: Record<string, any>;
  findOneInclude?: Record<string, any>;
}

@Injectable()
export abstract class BaseRepository<
  TCreate = any,
  TUpdate = any,
  TEntity = any,
> {
  protected abstract readonly options: BaseRepositoryOptions;

  constructor(protected readonly prisma: PrismaService) {}

  protected get model(): any {
    return (this.prisma as any)[this.options.modelName];
  }

  async create(createDto: TCreate): Promise<TEntity> {
    try {
      return await this.model.create({
        data: createDto,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `${this.options.modelName} with this value already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(pagination?: PaginationDto): Promise<PaginatedResult<TEntity>> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const orderBy = this.options.defaultOrderBy || { createdAt: 'desc' as const };

    const findManyArgs: any = {
      skip,
      take: limit,
      orderBy,
    };

    if (this.options.findAllInclude) {
      findManyArgs.include = this.options.findAllInclude;
    }

    const [data, total] = await Promise.all([
      this.model.findMany(findManyArgs),
      this.model.count(),
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

  async findOne(id: string): Promise<TEntity> {
    const findArgs: any = { where: { id } };

    if (this.options.findOneInclude) {
      findArgs.include = this.options.findOneInclude;
    }

    const entity = await this.model.findUnique(findArgs);

    if (!entity) {
      throw new NotFoundException(
        `${this.options.modelName} with ID ${id} not found`,
      );
    }

    return entity;
  }

  async update(id: string, updateDto: TUpdate): Promise<TEntity> {
    try {
      return await this.model.update({
        where: { id },
        data: updateDto,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException(`${this.options.modelName} with this value already exists`);
        if (error.code === 'P2025') throw new NotFoundException(`${this.options.modelName} with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.model.delete({
        where: { id },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`${this.options.modelName} with ID ${id} not found`);
      }
      throw error;
    }
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.model.count({ where });
  }
}
