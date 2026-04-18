# Packages & Dependencies

Complete documentation of every package used, why it was chosen, and what alternatives exist.

---

## Runtime Dependencies

### better-sqlite3 `^11.7.0`

**Purpose**: SQLite database driver for Node.js
**Why chosen**:
- Synchronous API (perfect for hook handler: open → write → close → exit)
- Fastest SQLite driver for Node.js (compiled C++ binding)
- WAL mode support for concurrent access
- Prepared statement caching
- No async overhead for simple operations

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `sql.js` | WASM-based, slower. No WAL mode support. |
| `better-sqlite3-multiple-ciphers` | Adds encryption we don't need. Extra complexity. |
| `sqlite3` (mapbox) | Callback-based async API. Slower for simple operations. More complex error handling. |
| `drizzle-orm` + sqlite driver | ORM adds abstraction we don't need. Raw SQL is simpler for 5 queries. |
| `knex` | Query builder overkill for static queries. |

**Key usage**:
```typescript
import Database from 'better-sqlite3';
const db = new Database('traces.db');
db.pragma('journal_mode = WAL');
const stmt = db.prepare('INSERT INTO spans ...');
stmt.run(values);
```

**Platform notes**:
- Requires prebuilt native binary or compilation (python3, make, g++)
- Prebuilt binaries available for: macOS (x64, arm64), Linux (x64, arm64), Windows (x64)
- Alpine Linux needs `alpine-sdk` package for compilation

---

### ink `^5.1.0`

**Purpose**: React-based terminal UI framework
**Why chosen**:
- Component-based architecture (React mental model)
- Flexbox layout for terminal
- useInput hook for keyboard handling
- Active maintenance (Vadim Demedes)
- Well-tested, used by: Gatsby CLI, Prisma CLI, Terraform CDK

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `blessed` | Unmaintained since 2017. Imperative API. |
| `blessed-contrib` | Depends on blessed. Also unmaintained. |
| `terminal-kit` | Lower-level. No component system. |
| `cli-table3` | Only tables, not a full TUI framework. |
| `ora` / `listr` | Task runners, not general TUI. |

**Key usage**:
```tsx
import { render, Box, Text, useInput } from 'ink';

function App() {
  useInput((input, key) => { /* handle keys */ });
  return <Box><Text>Hello TUI</Text></Box>;
}

render(<App />);
```

---

### react `^18.3.1`

**Purpose**: UI framework (required by Ink)
**Why chosen**: Ink is built on React. No alternative.
**Note**: React 18 (not 19) because Ink 5 targets React 18.

---

### nanoid `^5.0.9`

**Purpose**: Unique ID generation for spans and sessions
**Why chosen**:
- Compact: 21 characters (vs 36 for UUID)
- URL-safe alphabet
- Cryptographically random
- Fast (2.5x faster than UUID)
- Zero dependencies
- ESM-native

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `uuid` | 36 characters. Longer than needed. Wastes DB space. |
| `cuid2` | Sortable but 24 chars. More than we need. |
| `ulid` | Sortable + random but 26 chars. Timestamp prefix not needed (we store `started_at`). |
| `crypto.randomUUID()` | Built-in but 36 chars. Same as uuid. |

---

### meow `^13.2.0`

**Purpose**: CLI argument parsing
**Why chosen**:
- Lightweight (vs commander/yargs)
- ESM-native
- Auto-generates help text
- Clean flag definition API
- Used by Ink's own CLI tools

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `commander` | Heavier. More features than we need. |
| `yargs` | Heavy. CJS-first. Complex middleware system. |
| `citty` | Less mature. Fewer features. |
| `clipanion` | TypeScript-heavy. OOP style. Overkill. |
| `process.argv` manual | Too much boilerplate. |

**Key usage**:
```typescript
const cli = meow(`Usage: ...`, {
  importMeta: import.meta,
  flags: {
    session: { type: 'string', shortFlag: 's' },
  },
});
```

---

### zod `^3.23.0`

**Purpose**: Runtime validation of hook input JSON
**Why chosen**:
- TypeScript-first (infers types from schemas)
- Zero dependencies
- Small bundle size
- Parse, don't validate philosophy
- Industry standard for TS validation

**Note**: Currently minimal usage (hook input validation). Will expand for config file parsing.

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `joi` | Heavy. Not TypeScript-native. |
| `yup` | Less TypeScript integration. |
| `ajv` | JSON Schema based. More complex setup. |
| Manual type guards | Not DRY. Easy to miss edge cases. |

---

### chalk `^5.3.0`

**Purpose**: Terminal string styling (colors, bold, etc.)
**Why chosen**:
- ESM-native (v5+)
- Auto-detects color support
- Chainable API
- Standard (used by virtually all CLI tools)
- Used for non-Ink output (CLI commands like `sessions`)

**Note**: Inside Ink components, use Ink's `<Text color="...">` instead.

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `picocolors` | Smaller but no auto-detection. No nested styles. |
| `kleur` | Good but less ecosystem support. |
| `ansi-colors` | Not ESM-native. |
| ANSI codes directly | Not portable. Color support detection needed. |

---

## Dev Dependencies

### tsup `^8.3.5`

**Purpose**: TypeScript bundler (fast, zero-config)
**Why chosen**:
- Built on esbuild (extremely fast)
- Supports multiple entry points
- DTS (declaration) generation
- ESM output
- External dependency control
- Treeshaking

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `tsc` | No bundling. Slow. Doesn't handle JSX well. |
| `esbuild` directly | Need DTS generation. tsup wraps it cleanly. |
| `rollup` | Slower. More config needed. |
| `webpack` | Way too heavy for a library/CLI. |
| `unbuild` | Less mature. Fewer features. |

---

### tsx `^4.19.2`

**Purpose**: Run TypeScript directly (dev mode, no build step)
**Why chosen**:
- esbuild-based (fast)
- ESM support
- Drop-in replacement for `node`
- Handles JSX/TSX

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `ts-node` | Slower. ESM support is fragile. |
| `swc-node` | Less ecosystem support. |
| `bun` | Platform-specific. Not universally available. |

---

### vitest `^2.1.8`

**Purpose**: Test framework
**Why chosen**:
- Fast (Vite-based)
- ESM-native
- Compatible with Jest API (easy migration)
- Built-in TypeScript support
- Watch mode
- No config needed for simple cases

**Alternatives rejected**:
| Package | Why Not |
|---------|---------|
| `jest` | Slow. ESM support requires config hacks. CJS-first. |
| `mocha` | Needs separate assertion library. More setup. |
| `ava` | Less ecosystem. Fewer integrations. |
| `node:test` | Built-in but limited. No watch mode. |

---

### typescript `^5.7.2`

**Purpose**: Type checking
**Config highlights**:
- `target: ES2022` — Modern output, top-level await
- `module: ESNext` — ESM
- `moduleResolution: bundler` — Works with tsup/esbuild
- `strict: true` — Full type safety
- `jsx: react-jsx` — For Ink components

---

### @anthropic-ai/sdk `^0.39.0` (devDependency + optional peer)

**Purpose**: TypeScript types for SDK wrapper proxy
**Why dev + peer**:
- Dev: needed to compile and test the proxy handler
- Peer (optional): users who use SDK wrapper mode install it; hook-only users don't need it

---

### @types/better-sqlite3 `^7.6.12`

**Purpose**: TypeScript type definitions for better-sqlite3

---

### @types/react `^18.3.12`

**Purpose**: TypeScript type definitions for React (required by Ink)

---

### eslint `^9.15.0`

**Purpose**: Code linting (flat config)

---

### prettier `^3.4.1`

**Purpose**: Code formatting

---

## Peer Dependencies

### @anthropic-ai/sdk `>=0.30.0` (optional)

Only required if using the SDK wrapper (`trace(client)` mode). Not needed for Claude Code hook observer mode.

---

## Docker Dependencies

The `Dockerfile.dev` installs:
- `python3` — Required for building `better-sqlite3` native addon
- `make` — Build tools for native addons
- `g++` — C++ compiler for native addons

These are only needed if prebuilt binaries aren't available for the Docker image's platform.

---

## Dependency Graph

```mermaid
graph TD
    subgraph "Runtime"
        BS[better-sqlite3]
        INK[ink]
        REACT[react]
        NANO[nanoid]
        MEOW[meow]
        ZOD[zod]
        CHALK[chalk]
    end
    
    subgraph "Dev"
        TSUP[tsup]
        TSX[tsx]
        VIT[vitest]
        TS[typescript]
        SDK[@anthropic-ai/sdk]
    end
    
    INK --> REACT
    TSUP --> |esbuild| BUILD[dist/]
    TSX --> |dev mode| RUN[npm run atrace]
    VIT --> |test| TEST[npm test]
    
    BUILD --> CLI[dist/cli.js]
    BUILD --> LIB[dist/index.js]
    BUILD --> HOOK[dist/hook-handler.js]
    
    CLI --> INK
    CLI --> BS
    CLI --> MEOW
    LIB --> BS
    LIB --> NANO
    HOOK --> BS
    HOOK --> NANO
```

---

## Bundle Sizes (approximate)

| Entry Point | Size | Externals |
|-------------|------|-----------|
| `dist/index.js` (library) | ~13KB | SDK, sqlite3, react, ink |
| `dist/cli.js` (CLI + chunks) | ~40KB | sqlite3, react, ink, meow |
| `dist/hook-handler.js` (hook) | ~10KB | sqlite3 only |

Small bundles = fast startup. Critical for hook handler (must complete in <500ms).
