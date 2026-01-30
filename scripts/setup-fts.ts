/**
 * Script to set up FTS5 virtual table and triggers for SQLite.
 *
 * Usage: npx ts-node scripts/setup-fts.ts
 *
 * This creates an FTS5 virtual table for full-text search on inventory items
 * and populates it with existing data. The SearchService handles automatic
 * sync on create/update/delete operations at runtime.
 */

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('Setting up FTS5 for inventory search...');

    // Check if we're using SQLite
    try {
      await prisma.$queryRawUnsafe(`SELECT sqlite_version()`);
    } catch {
      console.log('Not a SQLite database. FTS5 setup is only needed for SQLite.');
      console.log('PostgreSQL uses ILIKE for search which works without setup.');
      return;
    }

    // Drop existing FTS table if exists
    await prisma.$queryRawUnsafe(`DROP TABLE IF EXISTS inventory_fts`);

    // Create FTS5 virtual table
    await prisma.$queryRawUnsafe(`
      CREATE VIRTUAL TABLE inventory_fts USING fts5(
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

    console.log('FTS5 virtual table created.');

    // Populate from existing data
    const result = await prisma.$queryRawUnsafe(`
      INSERT INTO inventory_fts(id, name, description, sku, serviceTag, serialNumber, category, model)
      SELECT id, name, COALESCE(description, ''), COALESCE(sku, ''), COALESCE(serviceTag, ''), COALESCE(serialNumber, ''), category, COALESCE(model, '')
      FROM InventoryItem WHERE deletedAt IS NULL
    `);

    // Count items
    const count: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM inventory_fts`,
    );
    console.log(`FTS5 index populated with ${count[0]?.count || 0} items.`);

    console.log('FTS5 setup complete!');
  } catch (error) {
    console.error('FTS5 setup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
