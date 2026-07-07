// Type augmentation for exceljs@4.4.0.
//
// The package's bundled `index.d.ts` models per-cell validation
// (`Cell.dataValidation`) but omits the worksheet-level `dataValidations`
// API entirely, even though it exists at runtime
// (see node_modules/exceljs/lib/doc/worksheet.js and
// node_modules/exceljs/lib/doc/data-validations.js). Without this
// augmentation, `worksheet.dataValidations` resolves to TypeScript's
// internal `error` type wherever it's used, which defeats type-aware lint
// rules (@typescript-eslint/no-unsafe-call, no-unsafe-member-access) and
// silently hides a real gap in the third-party types rather than reporting
// a normal "unsafe any" finding.
import 'exceljs';

declare module 'exceljs' {
  interface DataValidations {
    /** Add (or replace) a data validation rule for a cell or range address, e.g. "E2:E501". */
    add(address: string, validation: DataValidation): DataValidation;
    /** Look up the validation rule registered for an address, if any. */
    find(address: string): DataValidation | undefined;
    /** Remove the validation rule registered for an address. */
    remove(address: string): void;
  }

  interface Worksheet {
    dataValidations: DataValidations;
  }
}
