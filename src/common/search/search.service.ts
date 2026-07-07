import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SearchResult {
  id: string;
  rank?: number;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private ftsAvailable = false;
  private dbProvider: 'sqlite' | 'postgresql' = 'sqlite';

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.detectDatabaseProvider();
    if (this.dbProvider === 'sqlite') {
      await this.initFts5();
    }
  }

  private async detectDatabaseProvider(): Promise<void> {
    try {
      // Try a SQLite-specific query
      await this.prisma.$queryRawUnsafe(`SELECT sqlite_version()`);
      this.dbProvider = 'sqlite';
      this.logger.log('Database provider detected: SQLite');
    } catch {
      this.dbProvider = 'postgresql';
      this.logger.log('Database provider detected: PostgreSQL');
    }
  }

  private async initFts5(): Promise<void> {
    try {
      // Check if FTS5 table already exists
      const tables: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_fts'`,
      );

      if (tables.length === 0) {
        // Create FTS5 virtual table
        await this.prisma.$queryRawUnsafe(`
          CREATE VIRTUAL TABLE IF NOT EXISTS inventory_fts USING fts5(
            id UNINDEXED,
            name,
            description,
            sku,
            serviceTag,
            serialNumber,
            category,
            model,
            content='InventoryItem',
            content_rowid='rowid'
          )
        `);

        // Populate FTS table from existing data
        await this.prisma.$queryRawUnsafe(`
          INSERT INTO inventory_fts(id, name, description, sku, serviceTag, serialNumber, category, model)
          SELECT id, name, COALESCE(description, ''), COALESCE(sku, ''), COALESCE(serviceTag, ''), COALESCE(serialNumber, ''), category, COALESCE(model, '')
          FROM InventoryItem WHERE deletedAt IS NULL
        `);

        this.logger.log('FTS5 table created and populated');
      }

      this.ftsAvailable = true;
      this.logger.log('FTS5 search available');
    } catch (error) {
      this.logger.warn(
        'FTS5 not available, falling back to LIKE search',
        error,
      );
      this.ftsAvailable = false;
    }
  }

  async searchInventory(query: string): Promise<string[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const sanitizedQuery = query.replace(/['"\\;]/g, '').trim();

    if (this.dbProvider === 'sqlite' && this.ftsAvailable) {
      return this.searchFts5(sanitizedQuery);
    }

    if (this.dbProvider === 'postgresql') {
      return this.searchPostgreSQL(sanitizedQuery);
    }

    return this.searchLike(sanitizedQuery);
  }

  private async searchFts5(query: string): Promise<string[]> {
    try {
      // FTS5 search with prefix matching
      const ftsQuery = query
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => `"${w}"*`)
        .join(' ');

      const results: SearchResult[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM inventory_fts WHERE inventory_fts MATCH ? ORDER BY rank LIMIT 100`,
        ftsQuery,
      );

      return results.map((r) => r.id);
    } catch (error) {
      this.logger.warn('FTS5 search failed, falling back to LIKE', error);
      return this.searchLike(query);
    }
  }

  private async searchPostgreSQL(query: string): Promise<string[]> {
    try {
      const likePattern = `%${query}%`;
      const results: SearchResult[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM "InventoryItem"
         WHERE "deletedAt" IS NULL AND (
           "name" ILIKE $1
           OR "description" ILIKE $1
           OR "sku" ILIKE $1
           OR "serviceTag" ILIKE $1
           OR "serialNumber" ILIKE $1
           OR "category" ILIKE $1
           OR "model" ILIKE $1
         )
         LIMIT 100`,
        likePattern,
      );
      return results.map((r) => r.id);
    } catch (error) {
      this.logger.warn('PostgreSQL search failed', error);
      return [];
    }
  }

  private async searchLike(query: string): Promise<string[]> {
    try {
      const likePattern = `%${query}%`;
      const results: SearchResult[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM InventoryItem
         WHERE deletedAt IS NULL AND (
           name LIKE ?
           OR description LIKE ?
           OR sku LIKE ?
           OR serviceTag LIKE ?
           OR serialNumber LIKE ?
           OR category LIKE ?
           OR model LIKE ?
         )
         LIMIT 100`,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
      );
      return results.map((r) => r.id);
    } catch (error) {
      this.logger.warn('LIKE search failed', error);
      return [];
    }
  }

  async syncItem(id: string): Promise<void> {
    if (this.dbProvider !== 'sqlite' || !this.ftsAvailable) return;

    try {
      // Delete old entry
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM inventory_fts WHERE id = ?`,
        id,
      );

      // Re-insert from current data
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO inventory_fts(id, name, description, sku, serviceTag, serialNumber, category, model)
         SELECT id, name, COALESCE(description, ''), COALESCE(sku, ''), COALESCE(serviceTag, ''), COALESCE(serialNumber, ''), category, COALESCE(model, '')
         FROM InventoryItem WHERE id = ? AND deletedAt IS NULL`,
        id,
      );
    } catch (error) {
      this.logger.warn(`Failed to sync FTS for item ${id}`, error);
    }
  }

  async removeItem(id: string): Promise<void> {
    if (this.dbProvider !== 'sqlite' || !this.ftsAvailable) return;

    try {
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM inventory_fts WHERE id = ?`,
        id,
      );
    } catch (error) {
      this.logger.warn(`Failed to remove FTS entry for item ${id}`, error);
    }
  }

  async rebuildIndex(): Promise<void> {
    if (this.dbProvider !== 'sqlite' || !this.ftsAvailable) return;

    try {
      await this.prisma.$queryRawUnsafe(`DELETE FROM inventory_fts`);
      await this.prisma.$queryRawUnsafe(`
        INSERT INTO inventory_fts(id, name, description, sku, serviceTag, serialNumber, category, model)
        SELECT id, name, COALESCE(description, ''), COALESCE(sku, ''), COALESCE(serviceTag, ''), COALESCE(serialNumber, ''), category, COALESCE(model, '')
        FROM InventoryItem WHERE deletedAt IS NULL
      `);
      this.logger.log('FTS index rebuilt');
    } catch (error) {
      this.logger.warn('Failed to rebuild FTS index', error);
    }
  }
}
