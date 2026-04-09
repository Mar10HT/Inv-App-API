import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto, PaginatedResult, parsePagination, buildPaginationMeta } from '../dto';

export interface BaseRepositoryOptions {
  modelName: string;
  defaultOrderBy?: Record<string, 'asc' | 'desc'>;
  findAllInclude?: Record<string, unknown>;
  findOneInclude?: Record<string, unknown>;
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
    const { page, limit, skip } = parsePagination(pagination);
    const orderBy = this.options.defaultOrderBy || { createdAt: 'desc' as const };

    const findManyArgs: {
      skip: number;
      take: number;
      orderBy: Record<string, string>;
      include?: Record<string, unknown>;
    } = { skip, take: limit, orderBy };

    if (this.options.findAllInclude) {
      findManyArgs.include = this.options.findAllInclude;
    }

    const [data, total] = await Promise.all([
      this.model.findMany(findManyArgs),
      this.model.count(),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string): Promise<TEntity> {
    const findArgs: { where: { id: string }; include?: Record<string, unknown> } = { where: { id } };

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
