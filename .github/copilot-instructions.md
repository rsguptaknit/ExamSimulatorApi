# Exam Simulator API Workspace Instructions

This is the standalone Cloudflare Worker API called by the existing Exam Simulator application. The parent directory contains the authoritative `3.Exam Simulator API Requirements.txt` and implementation guidance. M1 is limited to fixed stubs for `GET /api/health`, `POST /api/v1/authorize`, and `GET /api/v1/content/version`.

- Use TypeScript strict mode, Hono, Zod, Wrangler, and the Cloudflare Workers Vitest pool.
- Keep request, response, and error contracts centralized in `shared/api-contract/`.
- Do not add D1, Drive access, production secrets, real leases, tickets, package streaming, key release, or administration endpoints in M1.
- Do not invent production wire formats or business rules; resolve open specification decisions against the shared contract first.
- Never log secrets, complete tokens, tickets, or key material.

## Setup checklist

- [x] Project scaffolding: standalone Worker workspace created.
- [x] M1 endpoint implementation and shared contract: three documented stub routes only.
- [x] REST Client scenarios and automated tests: eight tests pass.
- [x] Dependency installation and typecheck: strict TypeScript passes.
- [x] Test suite and documentation verification: Wrangler dry-run bundles successfully; README documents the M1-only integration boundary.

The dev server is not started automatically. Do not launch it unless the user asks to run/debug the API.
