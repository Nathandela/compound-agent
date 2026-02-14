#!/usr/bin/env node
/**
 * MCP Server for Compound Agent
 *
 * Exposes compound-agent functionality as MCP tools and resources:
 * - memory_search: Search memory items by semantic similarity
 * - memory_capture: Capture a new memory item
 * - memory://prime: Get workflow context with high-severity memory items
 *
 * This is a thin wrapper - all business logic is delegated to existing modules.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getPrimeContext } from './commands/management-prime.js';
import { VERSION } from './index.js';
import { inferMemoryItemType } from './memory/capture/triggers.js';
import { rankLessons, searchVector } from './memory/search/index.js';
import { appendMemoryItem, closeDb } from './memory/storage/index.js';
import { generateId, MemoryItemTypeSchema, PatternSchema } from './memory/types.js';
import type { MemoryItem, MemoryItemType } from './memory/types.js';

/** Default max results for search */
const DEFAULT_MAX_RESULTS = 5;

/** Minimum insight length for quality */
const MIN_INSIGHT_LENGTH = 10;

/** Search result with lesson and score */
interface SearchResult {
  lesson: MemoryItem;
  score: number;
  finalScore?: number;
}

/** Success result from memory_search tool */
interface SearchToolSuccess {
  lessons: SearchResult[];
  error?: undefined;
  action?: undefined;
}

/** Error result from memory_search tool */
interface SearchToolError {
  lessons: [];
  error: string;
  action: string;
}

/** Result from memory_search tool - typed union for success/failure */
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

/** Result from memory_capture tool */
interface CaptureToolResult {
  /** Unified memory item (all types) */
  item: MemoryItem;
  /** Backward-compatible alias (same object as item) */
  lesson: MemoryItem;
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
  maxResults?: number,
  typeFilter?: MemoryItemType
): Promise<SearchToolResult> {
  try {
    const limit = maxResults ?? DEFAULT_MAX_RESULTS;
    const results = await searchVector(repoRoot, query, { limit });
    const ranked = rankLessons(results);
    let lessons: SearchResult[] = ranked.map((r) => ({
      lesson: r.lesson,
      score: r.score,
      finalScore: r.finalScore,
    }));
    // Filter by type if specified
    if (typeFilter) {
      lessons = lessons.filter((r) => r.lesson.type === typeFilter);
    }
    return { lessons };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      error: `Search failed: ${message}`,
      action: 'Run: npx ca download-model',
      lessons: [],
    };
  }
}

/**
 * Shared capture logic for both MCP protocol and typed API paths.
 *
 * @param repoRoot - Repository root directory
 * @param insight - Memory item insight text
 * @param trigger - Optional trigger description
 * @param tags - Optional tags array
 * @param type - Memory item type (default: 'lesson')
 * @param pattern - Optional code pattern (required for 'pattern' type)
 * @returns Captured memory item (in `lesson` field for backward compat)
 */
async function handleCapture(
  repoRoot: string,
  insight: string,
  trigger?: string,
  tags?: string[],
  type?: MemoryItemType,
  pattern?: { bad: string; good: string },
  severity?: 'high' | 'medium' | 'low',
  confirmed?: boolean,
  supersedes?: string[],
  related?: string[]
): Promise<CaptureToolResult> {
  // Infer type from insight text if not explicitly provided
  let itemType = type ?? inferMemoryItemType(insight);
  // Require pattern field when type is explicitly 'pattern'
  if (type === 'pattern' && !pattern) {
    throw new Error('Pattern type requires a pattern field with { bad, good }');
  }
  // If inferred as 'pattern' but no pattern field, fall back to 'lesson'
  // (PatternItemSchema requires pattern field)
  if (itemType === 'pattern' && !pattern && !type) {
    itemType = 'lesson';
  }
  const item: MemoryItem = {
    type: itemType,
    id: generateId(insight, itemType),
    trigger: trigger ?? 'Manual capture via MCP',
    insight,
    tags: tags ?? [],
    source: 'manual',
    context: { tool: 'mcp', intent: 'memory capture', ...(severity ? { severity } : {}) },
    created: new Date().toISOString(),
    confirmed: confirmed ?? true,
    supersedes: supersedes ?? [],
    related: related ?? [],
    ...(pattern ? { pattern } : {}),
  } as MemoryItem;
  await appendMemoryItem(repoRoot, item);
  return { item, lesson: item };
}

/** MCP Server wrapper with typed tool/resource methods */
export interface CompoundAgentMcpServer {
  /** The underlying MCP server instance */
  server: McpServer;
  /** Repository root path (immutable after creation) */
  repoRoot: string;
  /**
   * Call a tool by name with parameters.
   * - memory_search: { query: string, maxResults?: number } → SearchToolResult
   * - memory_capture: { insight: string, trigger?: string, tags?: string[] } → CaptureToolResult
   */
  callTool<T = SearchToolResult | CaptureToolResult>(
    name: string,
    params: Record<string, unknown>
  ): Promise<T>;
  /**
   * Read a resource by URI.
   * - memory://prime → ResourceResult with workflow context
   */
  readResource(uri: string): Promise<ResourceResult>;
}

/**
 * Create an MCP server for compound-agent.
 *
 * @param repoRoot - Repository root directory (immutable after creation)
 * @returns MCP server wrapper with typed tool/resource methods
 */
export function createMcpServer(repoRoot: string): CompoundAgentMcpServer {
  const server = new McpServer({
    name: 'compound-agent',
    version: VERSION,
  });

  // Store tool handlers for direct invocation in tests
  const toolHandlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
  const resourceHandlers: Record<string, () => Promise<ResourceResult>> = {};

  // =========================================================================
  // memory_search tool
  // =========================================================================
  const searchInputSchema = {
    query: z.string().min(1, 'Query must be non-empty'),
    maxResults: z.number().int().positive().max(100).optional(),
    type: MemoryItemTypeSchema.optional(),
  };

  server.registerTool(
    'memory_search',
    {
      title: 'Search Memory',
      description: `Mandatory recall: search memory BEFORE:
- Architectural decisions or complex planning
- Patterns you've implemented before in this repo
- After corrections ("actually...", "wrong", "use X instead")

Returns relevant memory items ranked by similarity and severity.`,
      inputSchema: searchInputSchema,
    },
    async ({ query, maxResults, type: typeFilter }) => {
      const output = await handleSearch(repoRoot, query, maxResults, typeFilter);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    }
  );

  // Store handler for direct invocation
  toolHandlers['memory_search'] = async (params): Promise<SearchToolResult> => {
    const parsed = z.object(searchInputSchema).parse(params);
    return handleSearch(repoRoot, parsed.query, parsed.maxResults, parsed.type);
  };

  // =========================================================================
  // memory_capture tool
  // =========================================================================
  const captureInputSchema = {
    insight: z.string().min(MIN_INSIGHT_LENGTH, `Insight must be at least ${MIN_INSIGHT_LENGTH} characters`),
    trigger: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    type: MemoryItemTypeSchema.optional(),
    pattern: PatternSchema.optional(),
    severity: z.enum(['high', 'medium', 'low']).optional(),
    confirmed: z.boolean().optional(),
    supersedes: z.array(z.string()).optional(),
    related: z.array(z.string()).optional(),
  };

  server.registerTool(
    'memory_capture',
    {
      title: 'Capture Memory',
      description: `Capture a memory item AFTER:
- User corrects you ("no", "actually...", "use X instead")
- Test fail → fix → pass cycles
- Discovering project-specific knowledge

Types: lesson (default), solution, pattern (requires pattern field), preference.
Saves immediately and shows what was captured.`,
      inputSchema: captureInputSchema,
    },
    async ({ insight, trigger, tags, type, pattern, severity, confirmed, supersedes, related }) => {
      const output = await handleCapture(repoRoot, insight, trigger, tags, type, pattern, severity, confirmed, supersedes, related);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    }
  );

  // Store handler for direct invocation
  toolHandlers['memory_capture'] = async (params): Promise<CaptureToolResult> => {
    const parsed = z.object(captureInputSchema).parse(params);
    return handleCapture(repoRoot, parsed.insight, parsed.trigger, parsed.tags, parsed.type, parsed.pattern, parsed.severity, parsed.confirmed, parsed.supersedes, parsed.related);
  };

  // =========================================================================
  // memory://prime resource
  // =========================================================================
  server.registerResource(
    'prime',
    'memory://prime',
    {
      title: 'Prime Context',
      description: 'Workflow context with high-severity memory items for session start',
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
  resourceHandlers['memory://prime'] = async () => {
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
