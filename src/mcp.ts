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

import { getPrimeContext } from './commands/management-prime.js';
import { VERSION } from './index.js';
import { rankLessons, searchVector } from './search/index.js';
import { appendLesson, closeDb } from './storage/index.js';
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
  finalScore?: number;
}

/** Success result from lesson_search tool */
interface SearchToolSuccess {
  lessons: SearchResult[];
  error?: undefined;
  action?: undefined;
}

/** Error result from lesson_search tool */
interface SearchToolError {
  lessons: [];
  error: string;
  action: string;
}

/** Result from lesson_search tool - typed union for success/failure */
export type SearchToolResult = SearchToolSuccess | SearchToolError;

/**
 * Type guard to check if search result is an error.
 *
 * @param result - The search tool result
 * @returns true if the result is an error response
 */
export function isSearchError(result: SearchToolResult): result is SearchToolError {
  return 'error' in result && result.error !== undefined;
}

/** Result from lesson_capture tool */
interface CaptureToolResult {
  lesson: Lesson;
}

/** Result from reading a resource */
interface ResourceResult {
  content: string;
}

/**
 * Shared search logic for both MCP protocol and typed API paths.
 *
 * @param repoRoot - Repository root directory
 * @param query - Search query string
 * @param maxResults - Max results to return (default: DEFAULT_MAX_RESULTS)
 * @returns Ranked search results or error response
 */
async function handleSearch(
  repoRoot: string,
  query: string,
  maxResults?: number
): Promise<SearchToolResult> {
  try {
    const limit = maxResults ?? DEFAULT_MAX_RESULTS;
    const results = await searchVector(repoRoot, query, { limit });
    const ranked = rankLessons(results);
    const lessons: SearchResult[] = ranked.map((r) => ({
      lesson: r.lesson,
      score: r.score,
      finalScore: r.finalScore,
    }));
    return { lessons };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      error: `Search failed: ${message}`,
      action: 'Run: npx lna download-model',
      lessons: [],
    };
  }
}

/**
 * Shared capture logic for both MCP protocol and typed API paths.
 *
 * @param repoRoot - Repository root directory
 * @param insight - Lesson insight text
 * @param trigger - Optional trigger description
 * @param tags - Optional tags array
 * @returns Captured lesson
 */
async function handleCapture(
  repoRoot: string,
  insight: string,
  trigger?: string,
  tags?: string[]
): Promise<CaptureToolResult> {
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
  return { lesson };
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
      const output = await handleSearch(repoRoot, query, maxResults);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    }
  );

  // Store handler for direct invocation
  toolHandlers['lesson_search'] = async (params): Promise<SearchToolResult> => {
    const parsed = z.object(searchInputSchema).parse(params);
    return handleSearch(repoRoot, parsed.query, parsed.maxResults);
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
      const output = await handleCapture(repoRoot, insight, trigger, tags);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    }
  );

  // Store handler for direct invocation
  toolHandlers['lesson_capture'] = async (params): Promise<CaptureToolResult> => {
    const parsed = z.object(captureInputSchema).parse(params);
    return handleCapture(repoRoot, parsed.insight, parsed.trigger, parsed.tags);
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
 * Register signal handlers for clean resource cleanup.
 * Mirrors the CLI pattern in src/cli.ts.
 *
 * Note: We only close the SQLite database here. The embedding model
 * (node-llama-cpp) handles its own cleanup and calling unloadEmbedding()
 * during signal handlers can cause issues with the native addon.
 */
export function registerMcpCleanup(): void {
  const cleanup = (): void => {
    try {
      closeDb();
    } catch {
      // Ignore errors - database may never have been opened
    }
  };
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
}

/**
 * Start MCP server with stdio transport.
 * Called when this module is run directly.
 */
async function main(): Promise<void> {
  registerMcpCleanup();

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
