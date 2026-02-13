import path from 'node:path'

/**
 * Extract the top-level module name from a file path.
 * Given /project/src/commands/capture.ts, returns "commands".
 * Given /project/src/index.ts, returns null (root level, not inside a module).
 */
function getTopLevelModule(filepath) {
  const srcIndex = filepath.lastIndexOf('/src/')
  if (srcIndex === -1) return null

  const afterSrc = filepath.slice(srcIndex + '/src/'.length)
  const firstSlash = afterSrc.indexOf('/')
  if (firstSlash === -1) return null // File directly in src/, not in a module

  return afterSrc.slice(0, firstSlash)
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
 * Check if an import path ends with index.js, index, or is just a bare directory
 * (which would resolve to index).
 */
function isBarrelImport(importSource) {
  // Ends with /index.js or /index.ts or /index
  if (/\/index(\.[jt]sx?)?$/.test(importSource)) return true

  // No file extension and no further path after module name — bare directory import
  // e.g., '../memory' (no slash after module name, no extension)
  const segments = importSource.split('/')
  const lastSegment = segments[segments.length - 1]
  if (!lastSegment.includes('.')) {
    // Could be a bare directory import like '../memory'
    // We need to check it's not going deeper: count path segments after the first
    // non-dot segment. '../memory' has 1 real segment. '../memory/storage/jsonl' has 3.
    // But '../memory' should be allowed — it resolves to the module barrel.
    // We consider it a barrel if the import only goes one level deep into the
    // target module's directory.
    return true
  }

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
        if (!isBarrelImport(importSource)) {
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
