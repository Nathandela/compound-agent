#!/usr/bin/env node
/**
 * MCP Server for Learning Agent
 *
 * Exposes learning-agent functionality as MCP tools and resources:
 * - lesson_search: Search lessons by semantic similarity
 * - lesson_capture: Capture a new lesson
 * - lessons://prime: Get workflow context with high-severity lessons
 *
 * This is a thin wrapper - all business logic is delegated to existing modules.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getPrimeContext } from './commands/management/prime.js';
import { VERSION } from './index.js';
import { searchVector } from './search/index.js';
import { appendLesson } from './storage/index.js';
import { generateId } from './types.js';
import type { Lesson } from './types.js';

/** Default max results for search */
const DEFAULT_MAX_RESULTS = 5;

/** Minimum insight length for quality */
const MIN_INSIGHT_LENGTH = 10;

/** Search result with lesson and score */
interface SearchResult {
  lesson: Lesson;
  score: number;
}

/** Result from lesson_search tool */
interface SearchToolResult {
  lessons: SearchResult[];
}

/** Result from lesson_capture tool */
interface CaptureToolResult {
  lesson: Lesson;
}

/** Result from reading a resource */
interface ResourceResult {
  content: string;
}

/** MCP Server wrapper with typed tool/resource methods */
export interface LearningAgentMcpServer {
  /** The underlying MCP server instance */
  server: McpServer;
  /** Repository root path (immutable after creation) */
  repoRoot: string;
  /**
   * Call a tool by name with parameters.
   * - lesson_search: { query: string, maxResults?: number } → SearchToolResult
   * - lesson_capture: { insight: string, trigger?: string, tags?: string[] } → CaptureToolResult
   */
  callTool<T = SearchToolResult | CaptureToolResult>(
    name: string,
    params: Record<string, unknown>
  ): Promise<T>;
  /**
   * Read a resource by URI.
   * - lessons://prime → ResourceResult with workflow context
   */
  readResource(uri: string): Promise<ResourceResult>;
}

/**
 * Create an MCP server for learning-agent.
 *
 * @param repoRoot - Repository root directory (immutable after creation)
 * @returns MCP server wrapper with typed tool/resource methods
 */
export function createMcpServer(repoRoot: string): LearningAgentMcpServer {
  const server = new McpServer({
    name: 'learning-agent',
    version: VERSION,
  });

  // Store tool handlers for direct invocation in tests
  const toolHandlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
  const resourceHandlers: Record<string, () => Promise<ResourceResult>> = {};

  // =========================================================================
  // lesson_search tool
  // =========================================================================
  const searchInputSchema = {
    query: z.string().min(1, 'Query must be non-empty'),
    maxResults: z.number().int().positive().max(100).optional(),
  };

  server.registerTool(
    'lesson_search',
    {
      title: 'Search Lessons',
      description: `Mandatory recall: search lessons BEFORE:
- Architectural decisions or complex planning
- Patterns you've implemented before in this repo
- After corrections ("actually...", "wrong", "use X instead")

Returns relevant lessons ranked by similarity and severity.`,
      inputSchema: searchInputSchema,
    },
    async ({ query, maxResults }) => {
      try {
        const limit = maxResults ?? DEFAULT_MAX_RESULTS;
        const results = await searchVector(repoRoot, query, { limit });

        const lessons: SearchResult[] = results.map((r) => ({
          lesson: r.lesson,
          score: r.score,
        }));

        const output: SearchToolResult = { lessons };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        };
      } catch (err) {
        // Convert embedding errors to actionable messages
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Search failed: ${message}`,
                action: 'Run: npx lna download-model',
                lessons: [],
              }),
            },
          ],
        };
      }
    }
  );

  // Store handler for direct invocation
  toolHandlers['lesson_search'] = async (params) => {
    const parsed = z.object(searchInputSchema).parse(params);

    try {
      const limit = parsed.maxResults ?? DEFAULT_MAX_RESULTS;
      const results = await searchVector(repoRoot, parsed.query, { limit });
      // Handle case where searchVector returns undefined (shouldn't happen but defensive)
      const safeResults = results ?? [];
      return {
        lessons: safeResults.map((r) => ({ lesson: r.lesson, score: r.score })),
      } as SearchToolResult;
    } catch (err) {
      // Convert embedding errors to actionable messages
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        error: `Search failed: ${message}`,
        action: 'Run: npx lna download-model',
        lessons: [],
      } as unknown as SearchToolResult;
    }
  };

  // =========================================================================
  // lesson_capture tool
  // =========================================================================
  const captureInputSchema = {
    insight: z.string().min(MIN_INSIGHT_LENGTH, `Insight must be at least ${MIN_INSIGHT_LENGTH} characters`),
    trigger: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
  };

  server.registerTool(
    'lesson_capture',
    {
      title: 'Capture Lesson',
      description: `Capture a lesson AFTER:
- User corrects you ("no", "actually...", "use X instead")
- Test fail → fix → pass cycles
- Discovering project-specific knowledge

Saves immediately and shows what was captured.`,
      inputSchema: captureInputSchema,
    },
    async ({ insight, trigger, tags }) => {
      const lesson: Lesson = {
        id: generateId(insight),
        type: 'quick',
        trigger: trigger ?? 'Manual capture via MCP',
        insight,
        tags: tags ?? [],
        source: 'manual',
        context: { tool: 'mcp', intent: 'lesson capture' },
        created: new Date().toISOString(),
        confirmed: true,
        supersedes: [],
        related: [],
      };

      await appendLesson(repoRoot, lesson);

      const output: CaptureToolResult = { lesson };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    }
  );

  // Store handler for direct invocation
  toolHandlers['lesson_capture'] = async (params) => {
    const parsed = z.object(captureInputSchema).parse(params);

    const lesson: Lesson = {
      id: generateId(parsed.insight),
      type: 'quick',
      trigger: parsed.trigger ?? 'Manual capture via MCP',
      insight: parsed.insight,
      tags: parsed.tags ?? [],
      source: 'manual',
      context: { tool: 'mcp', intent: 'lesson capture' },
      created: new Date().toISOString(),
      confirmed: true,
      supersedes: [],
      related: [],
    };

    await appendLesson(repoRoot, lesson);
    return { lesson } as CaptureToolResult;
  };

  // =========================================================================
  // lessons://prime resource
  // =========================================================================
  server.registerResource(
    'prime',
    'lessons://prime',
    {
      title: 'Prime Context',
      description: 'Workflow context with high-severity lessons for session start',
      mimeType: 'text/plain',
    },
    async (uri) => {
      // Delegate to the single source of truth for prime context
      const content = await getPrimeContext(repoRoot);
      return {
        contents: [{ uri: uri.href, text: content }],
      };
    }
  );

  // Store handler for direct invocation
  resourceHandlers['lessons://prime'] = async () => {
    const content = await getPrimeContext(repoRoot);
    return { content };
  };

  // =========================================================================
  // Return wrapper with typed methods
  // =========================================================================
  return {
    server,
    repoRoot,

    async callTool<T = SearchToolResult | CaptureToolResult>(
      name: string,
      params: Record<string, unknown>
    ): Promise<T> {
      const handler = toolHandlers[name];
      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return handler(params) as Promise<T>;
    },

    async readResource(uri: string): Promise<ResourceResult> {
      const handler = resourceHandlers[uri];
      if (!handler) {
        throw new Error(`Unknown resource: ${uri}`);
      }
      return handler();
    },
  };
}

/**
 * Start MCP server with stdio transport.
 * Called when this module is run directly.
 */
async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const { server } = createMcpServer(repoRoot);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error('MCP Server error:', err);
    process.exit(1);
  });
}
