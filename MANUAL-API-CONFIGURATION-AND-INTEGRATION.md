# Manual API Configuration and Exam Simulator Integration

## Purpose

This guide describes what is currently implemented in the standalone Exam Simulator API, what remains, and how to connect the existing application to the local M1 API for a connectivity smoke test.

The API is a separate Cloudflare Worker project. It does not replace the Exam Simulator client. The implementation in this repository is **M1 stub functionality only** and is not suitable for production authorization or exams.

## Current implementation

The Worker is built with Cloudflare Workers, Hono, TypeScript, and Zod. Shared M1 request/response/error schemas are in `shared/api-contract/index.ts`.

Implemented routes:

| Method and route | Current behavior |
| --- | --- |
| `GET /api/health` | Returns `status`, `apiVersion`, and the current UTC time. No app headers or database are needed. |
| `POST /api/v1/authorize` | Validates the JSON body and app headers, then returns a fixed stub. It does not check a student, bind a device, issue a lease, or return entitlements. |
| `GET /api/v1/content/version` | Validates query parameters and requires a non-empty bearer header. It does not verify the bearer value, check entitlement, or look up a real package version. |

Every non-health request requires `X-App-Version` and `X-Platform`. Supported platform strings are `android`, `ios`, and `windows`. Authorization also requires `Content-Type: application/json`. Unknown authorization body fields and unknown content-version query parameters are rejected.

## What remains

### Required before connecting the real app workflow

- Open the Exam Simulator application source and identify its API/network client, environment configuration, and existing request/response models. That application source is not in this API project; the current `C:\Users\pramo\ramAPI` folder was empty when this guide was prepared.
- Compare the app's actual API contract with `shared/api-contract/index.ts`. Agree on exact JSON fields and update the shared contract and both clients together. The current M1 response shapes are placeholders, not a production compatibility promise.
- Choose how the client will handle the M1 stub result. The authorization stub has no lease, and the content-version route accepts only a placeholder bearer value without authenticating it. This is sufficient only for request/response wiring tests.

### Required for a usable production API

The following features are not implemented and must not be assumed to work:

- Approved-student lookup, authorization rate limits, validity checks, and one-active-device enforcement.
- Real ES256 offline lease issuance, key rotation, lease validation, and lease renewal.
- D1 schema, migrations, entitlement assignment, package metadata, and audit retention.
- Synchronization tickets, ticket expiry/replacement rules, and Google Drive service-account access.
- Streaming package downloads and package digest verification.
- Atomic single-use key release and the final interoperable device key-wrapping format.
- Production environment configuration, secret management, admin scripts, and end-to-end tests with the real app.

The parent API requirements document also lists protocol decisions that must be settled before production implementation, including the exact key-wrapping envelope, response fields, digest header, and per-email authorization threshold.

## Run the API locally

Use PowerShell:

```powershell
Set-Location 'C:\Users\pramo\OneDrive\Desktop\RAM\ExamSimulatorApi'
npm install
npm run typecheck
npm test
npm run dev
```

Wrangler serves the local Worker at `http://127.0.0.1:8787` by default. Leave this terminal running while testing the client. No `.dev.vars` secrets or Cloudflare account are needed for M1.

Do not run `npm run deploy` to publish these stubs to an account or production environment. The project has not been configured for production deployment.

## Configure the application for a local smoke test

Keep the API base URL in the app's development configuration, not hard-coded into production builds. Use a base URL appropriate to where the application runs:

| Client runtime | Local API base URL |
| --- | --- |
| Windows app on the same PC | `http://127.0.0.1:8787` |
| Android emulator | `http://10.0.2.2:8787` |
| iOS simulator | Usually `http://127.0.0.1:8787`; confirm the simulator's host networking. |
| Physical phone/tablet | Use a development Worker over HTTPS, or a host LAN address reachable by the device and allowed by local firewall/network policy. |

For mobile debug builds, allow local HTTP only as required by the platform's development network policy. Do not weaken release-build transport security; production traffic must use HTTPS.

In the application's HTTP client, add these headers to every request except health:

```http
X-App-Version: <the running app version>
X-Platform: android
```

Use the platform value matching the client: `android`, `ios`, or `windows`.

### Health check

```http
GET http://127.0.0.1:8787/api/health
```

Expected response shape:

```json
{
  "status": "ok",
  "apiVersion": "1",
  "time": "<current UTC timestamp>"
}
```

### Authorization stub

The app sends JSON using these property names:

```http
POST http://127.0.0.1:8787/api/v1/authorize
Content-Type: application/json
X-App-Version: 0.1.0
X-Platform: windows
```

```json
{
  "email": "student@example.com",
  "deviceId": "device-1",
  "devicePublicKey": "base64-p256-public-key-placeholder"
}
```

The current fixed response is:

```json
{
  "status": "stub",
  "entitlements": []
}
```

This response does **not** mean that the student was authorized. It contains no lease. Do not persist it as a signed-in session or use it to unlock exam content.

### Content-version stub

For a local request/response smoke test, provide any non-empty bearer value. It is not checked as a real lease:

```http
GET http://127.0.0.1:8787/api/v1/content/version?examCode=DEMO&mode=exam
Authorization: Bearer m1-placeholder
X-App-Version: 0.1.0
X-Platform: windows
```

Expected response:

```json
{
  "status": "stub",
  "examCode": "DEMO",
  "mode": "exam"
}
```

The API does not confirm that the exam exists, that the student has access, or that a package is available. The placeholder bearer value must never be used as a production credential.

REST Client examples for these calls are in `backend/api-tests/m1.http`.

## Recommended manual integration sequence

1. Keep the API running locally with `npm run dev`.
2. Call `GET /api/health` from the app or an HTTP client and confirm the response is reachable from the target runtime.
3. Call `POST /api/v1/authorize` using the request shape above. Confirm the app handles the explicit M1 stub without treating it as a real authorization or attempting to read a lease.
4. Call the content-version route with the temporary local bearer header and confirm that the app can deserialize the M1 stub response.
5. Compare app-side models and serialization with `shared/api-contract/index.ts`. Record any mismatch; do not silently add production behavior to make the stub appear functional.
6. Before production use, implement the pending server behavior, finalize contracts with the app team, and test real authorization, leases, entitlement changes, version assignment, downloads, key release, error handling, and concurrency end to end.

## Validation currently available

From the API project directory:

```powershell
npm run typecheck
npm test
npm run deploy -- --dry-run
```

The dry-run bundles the Worker but does not deploy it. The M1 test suite covers the stub routes, request validation, required headers, and unknown fields.
