# Implementation Plan

## Overview

Build a learning loop for Claude Code as a TypeScript pnpm package, deployable as a dev dependency to any repo.

**Project**: `<project-root>/`
**Timeline**: 2.5-3 weeks
**Stack**: TypeScript, pnpm, better-sqlite3, node-llama-cpp

---

## Week 1: Core Storage + Manual Capture

### Day 1: Project Setup

**Tasks**:
- [ ] Initialize pnpm project
- [ ] Configure TypeScript (strict mode)
- [ ] Configure tsup for dual CJS/ESM build
- [ ] Set up Vitest for testing
- [ ] Create package.json with bin entries

**Commands**:
```bash
cd <project-root>
pnpm init
pnpm add -D typescript tsup vitest @types/node
pnpm add zod commander
```

**Files to create**:
```
compound_agent/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── src/
    └── index.ts
```

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**tsup.config.ts**:
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

**Verification**:
```bash
pnpm build
# Should produce dist/index.js and dist/cli.js
```

---

### Day 2: Zod Schemas + JSONL Storage

**Tasks**:
- [ ] Define lesson schemas with Zod (including provenance + links)
- [ ] Implement JSONL append (atomic write)
- [ ] Implement JSONL read (stream for large files)
- [ ] Add lesson ID generation (hash-based)
- [ ] Add tombstone records for edits/deletes

**Files to create**:
```
src/
├── types.ts           # Zod schemas
└── storage/
    ├── index.ts
    └── jsonl.ts
```

**src/types.ts**:
```typescript
import { z } from 'zod';

export const QuickLessonSchema = z.object({
  id: z.string(),
  type: z.literal('quick'),
  trigger: z.string(),
  insight: z.string(),
  tags: z.array(z.string()).default([]),
  source: z.enum(['user_correction', 'self_correction', 'test_failure', 'manual']),
  context: z.object({
    tool: z.string(),
    intent: z.string(),
  }).optional(),
  created: z.string().datetime(),
  confirmed: z.boolean().default(true),
  supersedes: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  deleted: z.boolean().optional(),
  retrievalCount: z.number().default(0),
});

export const FullLessonSchema = z.object({
  id: z.string(),
  type: z.literal('full'),
  trigger: z.string(),
  insight: z.string(),
  evidence: z.string().optional(),
  tags: z.array(z.string()).default([]),
  severity: z.enum(['high', 'medium', 'low']).default('medium'),
  source: z.enum(['user_correction', 'self_correction', 'test_failure', 'manual']),
  context: z.object({
    tool: z.string(),
    intent: z.string(),
  }).optional(),
  created: z.string().datetime(),
  confirmed: z.boolean().default(true),
  supersedes: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  deleted: z.boolean().optional(),
  retrievalCount: z.number().default(0),
  pattern: z.object({
    bad: z.string(),
    good: z.string(),
  }).optional(),
});

export const LessonSchema = z.discriminatedUnion('type', [
  QuickLessonSchema,
  FullLessonSchema,
]);

export type QuickLesson = z.infer<typeof QuickLessonSchema>;
export type FullLesson = z.infer<typeof FullLessonSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
```

**src/storage/jsonl.ts**:
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { Lesson, LessonSchema } from '../types.js';

export function getLessonsPath(repoRoot: string): string {
  return path.join(repoRoot, '.claude', 'lessons', 'index.jsonl');
}

export function appendLesson(repoRoot: string, lesson: Lesson): void {
  const filePath = getLessonsPath(repoRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(lesson) + '\n');
}

export function readLessons(repoRoot: string): Lesson[] {
  const filePath = getLessonsPath(repoRoot);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = content
    .split('\n')
    .filter(line => line.trim())
    .map(line => LessonSchema.parse(JSON.parse(line)));

  // Last-write-wins for edits/deletes; drop tombstones
  const byId = new Map<string, Lesson>();
  for (const lesson of parsed) {
    byId.set(lesson.id, lesson);
  }

  return Array.from(byId.values()).filter(lesson => !lesson.deleted);
}
```

**Verification**:
```bash
pnpm build
node -e "
import { appendLesson, readLessons } from './dist/storage/jsonl.js';
appendLesson('.', {
  id: 'test-1',
  type: 'quick',
  trigger: 'test',
  insight: 'test insight',
  tags: [],
  source: 'manual',
  context: { tool: 'cli', intent: 'manual test' },
  created: new Date().toISOString(),
  confirmed: true,
  supersedes: [],
  related: [],
  retrievalCount: 0
});
console.log(readLessons('.'));
"
```

---

### Day 3: SQLite Index + FTS5

**Tasks**:
- [ ] Install better-sqlite3
- [ ] Create SQLite schema with FTS5
- [ ] Implement rebuildIndex() from JSONL
- [ ] Add keyword search via FTS5

**Commands**:
```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

**Files to create**:
```
src/storage/
└── sqlite.ts
```

**src/storage/sqlite.ts**:
```typescript
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { Lesson } from '../types.js';
import { readLessons } from './jsonl.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    trigger TEXT NOT NULL,
    insight TEXT NOT NULL,
    tags TEXT,
    severity TEXT,
    source TEXT,
    context TEXT,
    supersedes TEXT,
    related TEXT,
    deleted INTEGER DEFAULT 0,
    created TEXT NOT NULL,
    confirmed INTEGER DEFAULT 1,
    retrieval_count INTEGER DEFAULT 0,
    embedding BLOB
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
    trigger, insight, tags,
    content='lessons',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS lessons_ai AFTER INSERT ON lessons BEGIN
    INSERT INTO lessons_fts(rowid, trigger, insight, tags)
    VALUES (NEW.rowid, NEW.trigger, NEW.insight, NEW.tags);
  END;
`;

export function getDbPath(repoRoot: string): string {
  return path.join(repoRoot, '.claude', '.cache', 'lessons.sqlite');
}

export function openDb(repoRoot: string): Database.Database {
  const dbPath = getDbPath(repoRoot);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(SCHEMA);
  return db;
}

export function rebuildIndex(repoRoot: string): void {
  const db = openDb(repoRoot);
  const lessons = readLessons(repoRoot);

  db.exec('DELETE FROM lessons');

  const insert = db.prepare(`
    INSERT INTO lessons (
      id, type, trigger, insight, tags, severity,
      source, context, supersedes, related, deleted,
      created, confirmed, retrieval_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const lesson of lessons) {
    insert.run(
      lesson.id,
      lesson.type,
      lesson.trigger,
      lesson.insight,
      JSON.stringify(lesson.tags),
      lesson.type === 'full' ? lesson.severity : null,
      lesson.source,
      lesson.context ? JSON.stringify(lesson.context) : null,
      JSON.stringify(lesson.supersedes || []),
      JSON.stringify(lesson.related || []),
      lesson.deleted ? 1 : 0,
      lesson.created,
      lesson.confirmed ? 1 : 0,
      lesson.retrievalCount
    );
  }

  db.close();
}

export function searchKeyword(repoRoot: string, query: string, limit = 10): Lesson[] {
  const db = openDb(repoRoot);

  const rows = db.prepare(`
    SELECT l.* FROM lessons l
    JOIN lessons_fts fts ON l.rowid = fts.rowid
    WHERE lessons_fts MATCH ? AND l.deleted = 0
    ORDER BY rank
    LIMIT ?
  `).all(query, limit);

  db.close();
  return rows.map(rowToLesson);
}

function rowToLesson(row: any): Lesson {
  // Convert DB row back to Lesson type
  // Implementation details...
}
```

**Verification**:
```bash
pnpm build
node -e "
import { rebuildIndex, searchKeyword } from './dist/storage/sqlite.js';
rebuildIndex('.');
console.log(searchKeyword('.', 'test'));
"
```

---

### Day 4: Local Embeddings

**Tasks**:
- [ ] Install node-llama-cpp
- [ ] Implement model download to ~/.cache
- [ ] Create embedding function
- [ ] Add embedding cache (hash -> vector)

**Commands**:
```bash
pnpm add node-llama-cpp
```

**Files to create**:
```
src/embeddings/
├── index.ts
├── download.ts
├── nomic.ts
└── cache.ts
```

**src/embeddings/download.ts**:
```typescript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';

const MODEL_URL = 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf';
const MODEL_NAME = 'nomic-embed-text-v1.5.Q4_K_M.gguf';

export function getModelPath(): string {
  return path.join(os.homedir(), '.cache', 'compound-agent', 'models', MODEL_NAME);
}

export async function ensureModel(): Promise<string> {
  const modelPath = getModelPath();

  if (fs.existsSync(modelPath)) {
    return modelPath;
  }

  console.log('Downloading embedding model (~500MB)...');
  fs.mkdirSync(path.dirname(modelPath), { recursive: true });

  await downloadFile(MODEL_URL, modelPath);
  console.log('Model downloaded successfully.');

  return modelPath;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  // Implementation with progress bar...
}
```

**src/embeddings/nomic.ts**:
```typescript
import { getLlama, LlamaEmbedding } from 'node-llama-cpp';
import { ensureModel } from './download.js';

let embedding: LlamaEmbedding | null = null;

export async function getEmbedding(): Promise<LlamaEmbedding> {
  if (embedding) return embedding;

  const modelPath = await ensureModel();
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  embedding = await model.createEmbedding();

  return embedding;
}

export async function embedText(text: string): Promise<number[]> {
  const emb = await getEmbedding();
  const result = await emb.embedText(text);
  return Array.from(result.vector);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const emb = await getEmbedding();
  const results = await Promise.all(texts.map(t => emb.embedText(t)));
  return results.map(r => Array.from(r.vector));
}
```

**Verification**:
```bash
pnpm build
node -e "
import { embedText } from './dist/embeddings/nomic.js';
const vec = await embedText('Use Polars for large files');
console.log('Embedding dim:', vec.length);
"
```

---

### Day 5: Vector Search + CLI

**Tasks**:
- [ ] Implement cosine similarity search
- [ ] Create Commander.js CLI
- [ ] Add `learn` command
- [ ] Add `lessons search` command
- [ ] Add `lessons list` command

**Files to create**:
```
src/
├── cli.ts
└── search/
    ├── index.ts
    └── vector.ts
```

**src/search/vector.ts**:
```typescript
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function searchVector(
  queryEmbedding: number[],
  lessons: Array<{ embedding: number[]; lesson: Lesson }>,
  limit = 5
): Lesson[] {
  const scored = lessons.map(({ embedding, lesson }) => ({
    lesson,
    score: cosineSimilarity(queryEmbedding, embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.lesson);
}
```

**src/cli.ts**:
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { appendLesson, readLessons } from './storage/jsonl.js';
import { rebuildIndex, searchKeyword } from './storage/sqlite.js';
import { embedText } from './embeddings/nomic.js';
import { searchVector } from './search/vector.js';
import { generateId } from './utils.js';

const program = new Command();

program
  .name('compound-agent')
  .description('Learning loop for Claude Code')
  .version('0.1.0');

program
  .command('learn <insight>')
  .description('Capture a new lesson')
  .option('-t, --trigger <trigger>', 'What triggered this lesson')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--full', 'Create a full lesson (prompts for more details)')
  .action(async (insight, options) => {
    const lesson = {
      id: generateId(insight),
      type: 'quick' as const,
      trigger: options.trigger || insight,
      insight,
      tags: options.tags?.split(',') || [],
      source: 'manual' as const,
      context: { tool: 'cli', intent: 'manual capture' },
      created: new Date().toISOString(),
      confirmed: true,
      supersedes: [],
      related: [],
      retrievalCount: 0,
    };

    appendLesson(process.cwd(), lesson);
    rebuildIndex(process.cwd());
    console.log(`Captured: ${insight}`);
  });

program
  .command('search <query>')
  .description('Search lessons')
  .option('-n, --limit <n>', 'Max results', '5')
  .action(async (query, options) => {
    const results = searchKeyword(process.cwd(), query, parseInt(options.limit));

    if (results.length === 0) {
      console.log('No lessons found.');
      return;
    }

    for (const lesson of results) {
      console.log(`[${lesson.id}] ${lesson.insight}`);
      console.log(`  Trigger: ${lesson.trigger}`);
      console.log();
    }
  });

program
  .command('list')
  .description('List all lessons')
  .option('-n, --limit <n>', 'Max results', '20')
  .action((options) => {
    const lessons = readLessons(process.cwd());
    const limited = lessons.slice(0, parseInt(options.limit));

    console.log(`Lessons: ${lessons.length} total\n`);
    for (const lesson of limited) {
      console.log(`[${lesson.id}] ${lesson.insight}`);
    }
  });

program.parse();
```

**Verification**:
```bash
pnpm build

# Test CLI
./dist/cli.js learn "Use Polars for large files" --trigger "pandas was slow"
./dist/cli.js search "data processing"
./dist/cli.js list
```

---

## Week 2: Retrieval + Integration

### Day 1-2: Retrieval System

**Tasks**:
- [ ] Implement ranking with boosts
- [ ] Add severity boost (high=1.5)
- [ ] Add recency boost (30d=1.2)
- [ ] Add confirmation boost (1.3)
- [ ] Session-start load of high-severity lessons (no vector search)
- [ ] Plan-time retrieval + "Lessons Check" message
- [ ] Hard-fail if embeddings are unavailable
- [ ] Export retrieval API for hooks

**src/search/ranking.ts**:
```typescript
export interface RankingOptions {
  severityBoost: Record<string, number>;
  recencyDays: number;
  recencyBoost: number;
  confirmationBoost: number;
}

const DEFAULT_OPTIONS: RankingOptions = {
  severityBoost: { high: 1.5, medium: 1.0, low: 0.8 },
  recencyDays: 30,
  recencyBoost: 1.2,
  confirmationBoost: 1.3,
};

export function rankLessons(
  lessons: Array<{ lesson: Lesson; vectorScore: number }>,
  options = DEFAULT_OPTIONS
): Lesson[] {
  const now = Date.now();

  const ranked = lessons.map(({ lesson, vectorScore }) => {
    let score = vectorScore;

    // Severity boost
    if (lesson.type === 'full' && lesson.severity) {
      score *= options.severityBoost[lesson.severity] || 1.0;
    }

    // Recency boost
    const age = now - new Date(lesson.created).getTime();
    const ageDays = age / (1000 * 60 * 60 * 24);
    if (ageDays <= options.recencyDays) {
      score *= options.recencyBoost;
    }

    // Confirmation boost
    if (lesson.confirmed) {
      score *= options.confirmationBoost;
    }

    return { lesson, score };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.map(r => r.lesson);
}
```

---

### Day 3-4: Quality Filter + Triggers

**Tasks**:
- [ ] Implement novelty check
- [ ] Implement specificity check
- [ ] Implement actionability check
- [ ] Add user correction patterns
- [ ] Add self-correction patterns
- [ ] Add test-failure -> fix patterns
- [ ] Add related + supersedes linking logic

**src/capture/quality.ts**:
```typescript
import { searchKeyword } from '../storage/sqlite.js';

const VAGUE_PATTERNS = [
  /^(always |never )?(write |use |be )?(better|good|clean|proper)/i,
  /^(test|document|handle errors)/i,
];

export function isNovel(repoRoot: string, insight: string): boolean {
  const existing = searchKeyword(repoRoot, insight, 3);
  // Check if any existing lesson is too similar
  return !existing.some(l =>
    similarity(l.insight.toLowerCase(), insight.toLowerCase()) > 0.8
  );
}

export function isSpecific(insight: string): boolean {
  return !VAGUE_PATTERNS.some(p => p.test(insight));
}

export function isActionable(insight: string): boolean {
  // Must contain a verb or clear instruction
  const actionWords = ['use', 'avoid', 'prefer', 'always', 'never', 'instead', 'require'];
  return actionWords.some(w => insight.toLowerCase().includes(w));
}

export function shouldPropose(repoRoot: string, insight: string): boolean {
  if (!isNovel(repoRoot, insight)) return false;
  if (!isSpecific(insight)) return false;
  if (!isActionable(insight)) return false;
  return true;
}
```

---

### Day 5: Integration + Hooks

**Tasks**:
- [ ] Export public API for programmatic use
- [ ] Create hook integration examples
- [ ] Document Claude Code integration
- [ ] Add compound check (parallel reflection) at task end

**src/index.ts** (public API):
```typescript
export { appendLesson, readLessons } from './storage/jsonl.js';
export { rebuildIndex, searchKeyword } from './storage/sqlite.js';
export { embedText, embedTexts } from './embeddings/nomic.js';
export { searchVector } from './search/vector.js';
export { rankLessons } from './search/ranking.js';
export { shouldPropose } from './capture/quality.js';
export type { Lesson, QuickLesson, FullLesson } from './types.js';

// High-level retrieval function
export async function retrieveRelevantLessons(
  repoRoot: string,
  context: string,
  limit = 5
): Promise<Lesson[]> {
  // Implementation combining vector search + ranking
}

// Check and propose lesson
export function proposeLesson(
  repoRoot: string,
  trigger: string,
  insight: string
): { shouldPropose: boolean; reason?: string } {
  // Implementation using quality filters
}
```

---

## Week 3: Polish

### Day 1-2: Compaction + Stats

- [ ] Apply tombstones + periodic rewrite compaction
- [ ] Archive lessons >90 days with 0 retrievals
- [ ] Track retrieval count
- [ ] `lessons stats` command

### Day 3-4: Cross-Repo + QoL

- [ ] `lessons export` (JSON dump)
- [ ] `lessons import` (merge lessons)
- [ ] Better CLI formatting

### Day 5: Tests + Docs

- [ ] Vitest tests for all modules
- [ ] README with examples
- [ ] CHANGELOG

---

## Verification Checklist

```bash
# After Week 1
pnpm build
./dist/cli.js learn "Test lesson"
./dist/cli.js search "test"
./dist/cli.js list

# After Week 2
node -e "
import { retrieveRelevantLessons } from './dist/index.js';
const lessons = await retrieveRelevantLessons('.', 'data processing');
console.log(lessons);
"

# After Week 3
pnpm test
./dist/cli.js stats
./dist/cli.js export > lessons.json
```

---

## Next Action

```bash
cd <project-root>
pnpm init
pnpm add -D typescript tsup vitest @types/node
pnpm add zod commander better-sqlite3 node-llama-cpp
pnpm add -D @types/better-sqlite3
```
