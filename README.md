# chronoloop-backend

Express + TypeScript backend for Chronoloop. Uses Prisma for ORM, PostgreSQL (via Neon) for persistence, and deploys to Render.

## Available Scripts

- `pnpm dev` — Run dev server with hot reload (tsx watch)
- `pnpm build` — Compile TypeScript to `dist/`
- `pnpm start` — Run migrations and start production server
- `pnpm typecheck` — Check types without emitting
- `pnpm lint` — Run ESLint
- `pnpm test` — Run tests (vitest)

## Setup

1. Copy `.env.example` to `.env` and `.env.test`
2. Fill in real Neon PostgreSQL connection strings and JWT secrets
3. Run `pnpm install` (already done in scaffold)
4. Ready for development

See `.env.example` for all required variables.
