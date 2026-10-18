import {
  toEndOfBusinessDay,
  toIsoDateTime,
  toStartOfBusinessDay,
} from './date.util';

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

describe('toEndOfBusinessDay', () => {
  it('reads a date-only string as the last instant of that day in Honduras', () => {
    expect(toEndOfBusinessDay('2027-06-30')).toBe('2027-07-01T05:59:59.999Z');
  });

  it('keeps a full ISO datetime unchanged', () => {
    expect(toEndOfBusinessDay('2027-06-30T15:30:00.000Z')).toBe(
      '2027-06-30T15:30:00.000Z',
    );
  });
});

describe('toStartOfBusinessDay', () => {
  it('reads a date-only string as the first instant of that day in Honduras', () => {
    expect(toStartOfBusinessDay('2027-06-30')).toBe('2027-06-30T06:00:00.000Z');
  });
});
