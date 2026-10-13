import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * The frontend translates a 400/409/422 by its code (API_ERRORS.<code>). An
 * exception thrown without apiError() reaches the user untranslated, so this
 * keeps every new one from slipping through.
 */
describe('user-facing exceptions', () => {
  const root = join(__dirname, '..', '..');

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });

  it('are all thrown with apiError(), so the frontend can translate them', () => {
    const offenders: string[] = [];
    const thrown =
      /new (BadRequest|Conflict|UnprocessableEntity)Exception\(\s*([^\s])/g;

    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(thrown)) {
        const firstArg = source.slice(match.index + match[0].length - 1);
        if (!firstArg.startsWith('apiError(')) {
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${relative(root, file)}:${line}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
