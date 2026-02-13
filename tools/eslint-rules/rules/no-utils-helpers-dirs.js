const BANNED_DIRS = new Set(['utils', 'helpers', 'shared', 'common', 'misc'])

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow files in utils/, helpers/, shared/, common/, or misc/ directories',
      recommended: true,
    },
    messages: {
      noUtilsHelpersDir:
        "Utils/helpers directories indicate unclear responsibility. Move this function to the module that owns its concern. Rename the directory to reflect its domain (e.g., 'formatting', 'validation'). See: docs/standards/code-organization.md",
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const filename = context.filename ?? context.getFilename()

        // Skip node_modules
        if (filename.includes('node_modules')) {
          return
        }

        const segments = filename.split('/')

        for (const segment of segments) {
          if (BANNED_DIRS.has(segment)) {
            context.report({
              node,
              messageId: 'noUtilsHelpersDir',
            })
            return
          }
        }
      },
    }
  },
}

export default rule
