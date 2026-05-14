import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto, PaginatedResult, parsePagination, buildPaginationMeta } from '../dto';

export interface BaseRepositoryOptions {
  modelName: string;
  defaultOrderBy?: Record<string, 'asc' | 'desc'>;
  findAllInclude?: Record<string, unknown>;
  findOneInclude?: Record<string, unknown>;
}

function getPrismaErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((error as { code: string }).code)
  ) {
    return (error as { code: string }).code;
  }
  return null;
}

@Injectable()
export abstract class BaseRepository<
  TCreate = any,
  TUpdate = any,
  TEntity = any,
> {
  protected abstract readonly options: BaseRepositoryOptions;

  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Tenant-aware Prisma model accessor.
   *
   * Routes through `prisma.tenant()` so any model in TENANT_SCOPED_MODELS gets
   * automatic org filtering on findMany / count / create / updateMany /
   * deleteMany. For models that are not tenant-scoped (User, Role, etc.) the
   * extension is a structural no-op.
   *
   * Note: id-based findUnique / update / delete still trust the caller. Phase
   * 6 hardening will tighten those by promoting to findFirst / updateMany /
   * deleteMany with the merged org filter.
   */
  protected get model(): any {
    return (this.prisma.tenant() as any)[this.options.modelName];
  }

  async create(createDto: TCreate): Promise<TEntity> {
    try {
      return await this.model.create({
        data: createDto,
      });
    } catch (error: unknown) {
      if (getPrismaErrorCode(error) === 'P2002') {
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
      const code = getPrismaErrorCode(error);
      if (code === 'P2002') throw new ConflictException(`${this.options.modelName} with this value already exists`);
      if (code === 'P2025') throw new NotFoundException(`${this.options.modelName} with ID ${id} not found`);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.model.delete({
        where: { id },
      });
    } catch (error: unknown) {
      if (getPrismaErrorCode(error) === 'P2025') {
        throw new NotFoundException(`${this.options.modelName} with ID ${id} not found`);
      }
      throw error;
    }
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.model.count({ where });
  }
}
