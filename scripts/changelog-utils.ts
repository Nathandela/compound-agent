/**
 * Pure parsing/escaping logic for changelog extraction.
 * Shared between the prebuild script and its tests.
 */

/** Extract up to `count` versioned sections (## [x.y.z]) from a changelog string. */
export function extractSections(changelog: string, count = 3): string[] {
  const sectionRegex = /^## \[\d+\.\d+\.\d+\]/gm;
  const matches: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(changelog)) !== null) {
    matches.push(match.index);
  }
  return matches.slice(0, count).map((start, i) => {
    const end = matches[i + 1] ?? changelog.length;
    return changelog.slice(start, end).trimEnd();
  });
}

/** Escape a string for safe embedding inside a JS template literal. */
export function escapeForTemplateLiteral(content: string): string {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}
