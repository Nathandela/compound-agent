import path from 'node:path'

const srcMarker = path.sep + 'src' + path.sep

/**
 * Extract the top-level module name from a file path.
 * Given /project/src/commands/capture.ts, returns "commands".
 * Given /project/src/index.ts, returns null (root level, not inside a module).
 */
function getTopLevelModule(filepath) {
  const srcIndex = filepath.lastIndexOf(srcMarker)
  if (srcIndex === -1) return null

  const afterSrc = filepath.slice(srcIndex + srcMarker.length)
  const firstSep = afterSrc.indexOf(path.sep)
  if (firstSep === -1) return null // File directly in src/, not in a module

  return afterSrc.slice(0, firstSep)
}

/**
 * Given a relative import specifier and the importing file's absolute path,
 * determine the top-level module of the import target.
 */
function getImportTargetModule(importSource, importerPath) {
  const importerDir = path.dirname(importerPath)
  const resolved = path.resolve(importerDir, importSource)

  return getTopLevelModule(resolved)
}

/**
 * Check if a resolved absolute path points to a barrel import (module root or sub-barrel).
 * A barrel import is one where the resolved path is:
 *   - src/<module> (bare directory)
 *   - any path ending in /index[.ext] (barrel re-export at any depth)
 */
function isBarrelImport(resolvedPath) {
  const srcIndex = resolvedPath.lastIndexOf(srcMarker)
  if (srcIndex === -1) return true // not in src, skip

  const afterSrc = resolvedPath.slice(srcIndex + srcMarker.length)
  const segments = afterSrc.split(path.sep).filter(Boolean)

  // src/<module> (bare dir)
  if (segments.length === 1) return true
  // Any path ending in index[.ext] is a barrel re-export
  const lastSegment = segments[segments.length - 1]
  if (/^index(\.[jt]sx?)?$/.test(lastSegment)) return true

  return false
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce cross-module imports go through barrel exports (index.ts)',
      recommended: true,
    },
    messages: {
      enforceBarrelExport:
        "Import from the module's public API (index.ts), not internal files. Change to import from the module's index.js barrel export. See: docs/standards/code-organization.md#module-design",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const importSource = node.source.value

        // Skip non-relative imports (packages, node: builtins)
        if (!importSource.startsWith('.')) {
          return
        }

        const filename = context.filename ?? context.getFilename()

        const importerModule = getTopLevelModule(filename)
        const targetModule = getImportTargetModule(importSource, filename)

        // If importer is not inside a module (e.g., src/index.ts), skip
        if (importerModule === null) {
          return
        }

        // If target is not inside a module (e.g., importing from src/index.ts), skip
        if (targetModule === null) {
          return
        }

        // Same module — internal imports are fine
        if (importerModule === targetModule) {
          return
        }

        // Cross-module import: must be a barrel import
        const importerDir = path.dirname(filename)
        const resolvedImport = path.resolve(importerDir, importSource)
        if (!isBarrelImport(resolvedImport)) {
          context.report({
            node,
            messageId: 'enforceBarrelExport',
          })
        }
      },
    }
  },
}

export default rule
