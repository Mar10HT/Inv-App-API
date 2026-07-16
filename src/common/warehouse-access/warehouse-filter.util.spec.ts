import {
  warehouseFilter,
  warehouseFilterMultiField,
} from './warehouse-filter.util';

describe('warehouseFilter', () => {
  it('returns empty object when warehouseIds is null (unrestricted)', () => {
    expect(warehouseFilter(null)).toEqual({});
  });

  it('returns IN filter for warehouseId field by default', () => {
    expect(warehouseFilter(['wh-1', 'wh-2'])).toEqual({
      warehouseId: { in: ['wh-1', 'wh-2'] },
    });
  });

  it('uses custom field name when provided', () => {
    expect(warehouseFilter(['wh-1'], 'sourceWarehouseId')).toEqual({
      sourceWarehouseId: { in: ['wh-1'] },
    });
  });

  it('handles empty array (restricts to nothing)', () => {
    expect(warehouseFilter([])).toEqual({
      warehouseId: { in: [] },
    });
  });
});

describe('warehouseFilterMultiField', () => {
  it('returns empty object when warehouseIds is null', () => {
    expect(
      warehouseFilterMultiField(null, [
        'sourceWarehouseId',
        'destinationWarehouseId',
      ]),
    ).toEqual({});
  });

  it('returns OR clause covering all provided fields', () => {
    const result = warehouseFilterMultiField(
      ['wh-1'],
      ['sourceWarehouseId', 'destinationWarehouseId'],
    );
    expect(result).toEqual({
      OR: [
        { sourceWarehouseId: { in: ['wh-1'] } },
        { destinationWarehouseId: { in: ['wh-1'] } },
      ],
    });
  });

  it('handles multiple warehouse IDs across multiple fields', () => {
    // warehouseFilterMultiField's return type is `Record<string, any>` (it
    // builds a dynamic Prisma where-clause); cast to the concrete shape this
    // test actually inspects so property access below is fully typed.
    const result = warehouseFilterMultiField(
      ['wh-1', 'wh-2'],
      ['sourceWarehouseId', 'destinationWarehouseId'],
    ) as { OR: Array<Record<string, { in: string[] }>> };

    expect(result.OR[0].sourceWarehouseId.in).toEqual(['wh-1', 'wh-2']);
    expect(result.OR[1].destinationWarehouseId.in).toEqual(['wh-1', 'wh-2']);
  });

  it('handles single field', () => {
    const result = warehouseFilterMultiField(['wh-1'], ['warehouseId']);
    expect(result).toEqual({
      OR: [{ warehouseId: { in: ['wh-1'] } }],
    });
  });
});
