# AGENTS.md

This file is the single source of truth for AI coding agents working in this repository —
harness-neutral, vendor-independent (see [agents.md](https://agents.md)). Vendor-specific shims
(`CLAUDE.md`, `.cursor/rules/`, etc.), if generated, are thin pointers into this file, never a
duplicate of its content — this is the only place with real content.

## What this project is

**{{projectName}}** — two independently deployable pieces:

- `api/` — NestJS + TypeScript backend (REST API)
- `app/` — Vite + React + TypeScript frontend (SPA, no SSR)

## Commands

### `api/`

```
pnpm dev         # start in watch mode — http://localhost:3000
pnpm build       # compile to dist/
pnpm start:prod  # run the compiled build (node dist/main)
pnpm test        # unit tests (Jest)
pnpm test:e2e    # end-to-end tests (Jest + supertest — see test/jest-e2e.js)
```

### `app/`

```
pnpm dev      # start the Vite dev server — http://localhost:5173
pnpm build    # production build to dist/
pnpm preview  # preview the production build locally
```

<!-- @inikitty:inject:agents-sections -->

## Guardrails

- Never commit `.env` files — copy the relevant variables from `.env.example` instead.
- Never remove `whitelist: true, forbidNonWhitelisted: true` from `api/src/main.ts`'s global
  `ValidationPipe` — it's what rejects requests carrying fields a DTO doesn't declare.
