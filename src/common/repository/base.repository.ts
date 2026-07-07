import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  PaginationDto,
  PaginatedResult,
  parsePagination,
  buildPaginationMeta,
} from '../dto';

export interface BaseRepositoryOptions {
  modelName: string;
  defaultOrderBy?: Record<string, 'asc' | 'desc'>;
  findAllInclude?: Record<string, unknown>;
  findOneInclude?: Record<string, unknown>;
  /**
   * Entity name written to the audit log. Defaults to PascalCase of
   * `modelName` (e.g. 'category' -> 'Category'). Override when the audit
   * label should differ from the Prisma model accessor.
   */
  auditEntityName?: string;
}

@Injectable()
export abstract class BaseRepository<
  TCreate = any,
  TUpdate = any,
  TEntity = any,
> {
  protected abstract readonly options: BaseRepositoryOptions;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly auditService: AuditService,
  ) {}

  protected get model(): any {
    return (this.prisma as any)[this.options.modelName];
  }

  protected get auditEntity(): string {
    if (this.options.auditEntityName) return this.options.auditEntityName;
    const name = this.options.modelName;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Fields that must never appear in an audit `changes` snapshot regardless
   * of the entity. Stripped by `summarizeForAudit` before write.
   * - Bookkeeping (id, *At) — noise, not interesting in a diff.
   * - Credential-equivalent (password, *token*, *secret*, *apiKey*, *hash*)
   *   — leaking these into the audit log defeats the point of storing
   *   them hashed/encrypted in the first place.
   */
  private static readonly AUDIT_FIELD_DENYLIST =
    /^(id|createdAt|updatedAt|deletedAt|password|.*token.*|.*secret.*|.*apiKey.*|.*hash.*)$/i;

  /**
   * Override to control which fields land in the audit `changes` snapshot.
   * Default strips bookkeeping fields and anything matching
   * `AUDIT_FIELD_DENYLIST`. Subclasses that need to keep a sensitive-named
   * field can override and selectively re-include it.
   */
  protected summarizeForAudit(entity: object | null): Record<string, unknown> {
    if (!entity || typeof entity !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entity)) {
      if (BaseRepository.AUDIT_FIELD_DENYLIST.test(key)) continue;
      out[key] = value;
    }
    return out;
  }

  async create(createDto: TCreate, userId?: string): Promise<TEntity> {
    let entity: TEntity;
    try {
      entity = await this.model.create({
        data: createDto,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `${this.options.modelName} with this value already exists`,
        );
      }
      throw error;
    }

    this.auditService.logSafe({
      action: 'CREATE',
      entity: this.auditEntity,
      entityId: (entity as any).id,
      userId,
      changes: { after: this.summarizeForAudit(entity) },
    });

    return entity;
  }

  async findAll(pagination?: PaginationDto): Promise<PaginatedResult<TEntity>> {
    const { page, limit, skip } = parsePagination(pagination);
    const orderBy = this.options.defaultOrderBy || {
      createdAt: 'desc' as const,
    };

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
    const findArgs: {
      where: { id: string };
      include?: Record<string, unknown>;
    } = { where: { id } };

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

  async update(
    id: string,
    updateDto: TUpdate,
    userId?: string,
  ): Promise<TEntity> {
    // Load the prior state for the audit diff. If it doesn't exist the
    // following update would 404 anyway, so this isn't an extra failure path.
    const before = await this.model.findUnique({ where: { id } });

    let entity: TEntity;
    try {
      entity = await this.model.update({
        where: { id },
        data: updateDto,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException(
            `${this.options.modelName} with this value already exists`,
          );
        if (error.code === 'P2025')
          throw new NotFoundException(
            `${this.options.modelName} with ID ${id} not found`,
          );
      }
      throw error;
    }

    this.auditService.logSafe({
      action: 'UPDATE',
      entity: this.auditEntity,
      entityId: id,
      userId,
      changes: {
        before: this.summarizeForAudit(before),
        after: this.summarizeForAudit(entity),
        fields: Object.keys(updateDto as Record<string, unknown>),
      },
    });

    return entity;
  }

  async remove(id: string, userId?: string): Promise<void> {
    const before = await this.model.findUnique({ where: { id } });

    try {
      await this.model.delete({
        where: { id },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(
          `${this.options.modelName} with ID ${id} not found`,
        );
      }
      throw error;
    }

    this.auditService.logSafe({
      action: 'DELETE',
      entity: this.auditEntity,
      entityId: id,
      userId,
      changes: { before: this.summarizeForAudit(before) },
    });
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.model.count({ where });
  }
}
