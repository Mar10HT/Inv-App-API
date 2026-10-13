import { toIsoDateTime } from './date.util';

describe('toIsoDateTime', () => {
  it('expands a date-only string to midnight UTC', () => {
    expect(toIsoDateTime('2027-06-30')).toBe('2027-06-30T00:00:00.000Z');
  });

  it('keeps a full ISO datetime unchanged', () => {
    expect(toIsoDateTime('2027-06-30T15:30:00.000Z')).toBe(
      '2027-06-30T15:30:00.000Z',
    );
  });
});
