# Exam Simulator API

Standalone Cloudflare Worker API for the existing Exam Simulator application. This workspace implements **M1 stubs only**, as required by the parent `3.Exam Simulator API Requirements.txt` and `4.GitHub Copilot Instructions-Exam Simulator API.txt` documents.

## M1 boundary

For completed work, pending production scope, and manual client setup, see
[`MANUAL-API-CONFIGURATION-AND-INTEGRATION.md`](MANUAL-API-CONFIGURATION-AND-INTEGRATION.md).

Implemented routes:

- `GET /api/health`: public health response; no database dependency.
- `POST /api/v1/authorize`: validates the documented request and required headers, then returns an explicit stub response. It does not look up students, bind devices, or issue a lease.
- `GET /api/v1/content/version`: validates query parameters and requires a bearer header to exercise the protected-route boundary. It does not verify a lease or look up entitlement/package data.

The stub schemas are centralized in `shared/api-contract/`. They are an M1 development contract, not the final production contract. The existing application is not present in this workspace, so reconcile these shared types with the app's contract before integration or deployment. See the requirements' "Open specification decisions" for production protocol details.

This project intentionally has no D1, migrations, Drive access, production secrets, real authentication or leases, tickets, package streaming, key release, cryptography, or administration routes. Do not deploy these stubs as a production API.

## Requirements

- Node.js 20 or newer
- npm
- A Cloudflare account only if deploying (not needed for local tests)

## Project configuration

`package.json` is strict JSON, so it cannot contain inline comments. Its scripts are:

- `dev`: starts Wrangler's local Worker server.
- `test`: runs the Vitest suite once in the Cloudflare Worker test runtime.
- `test:watch`: reruns tests while files change.
- `typecheck`: runs strict TypeScript validation without emitting build files.
- `deploy`: invokes Wrangler deployment; do not use it for these M1 stubs.

Runtime dependencies are Hono for routing, `@hono/zod-validator` for request validation, and Zod for shared runtime schemas. Development dependencies provide the Cloudflare Worker test runtime, TypeScript, Vitest, Wrangler, and Worker global types.

## Install and run

```powershell
npm install
npm run typecheck
npm test
npm run dev
```

The local Worker listens at `http://127.0.0.1:8787` by default. Example HTTP requests are in `backend/api-tests/m1.http`.

All non-health app requests require `X-App-Version` and `X-Platform` (`android`, `ios`, or `windows`). JSON authorization requests require `Content-Type: application/json`. The content-version stub requires an `Authorization: Bearer ...` header, but intentionally does not validate a token.

## Deploying

Deployment is deliberately not configured for production: the current responses are stubs and do not authorize users. After production contracts and milestones are approved, configure separate development and production Worker names, databases, Drive folders, and keys as specified in the requirements. Never add secrets to this repository.
