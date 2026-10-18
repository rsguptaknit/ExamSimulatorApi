import { z } from "zod"; // Zod schemas validate both incoming requests and API response fixtures.

// These are the only platform labels accepted in the app's X-Platform header.
export const platformSchema = z.enum(["android", "ios", "windows"]);
// Exam and Prep are the two business modes named in the API requirements.
export const contentModeSchema = z.enum(["exam", "prep"]);

// Keep the full agreed error vocabulary in one place so clients do not invent variants.
export const apiErrorCodeSchema = z.enum([
  "INVALID_REQUEST", // The request body, query, or required header is invalid.
  "LEASE_INVALID", // A supplied lease is invalid or missing on a protected route.
  "LEASE_EXPIRED", // A lease has passed its permitted validity interval.
  "NOT_AUTHORIZED", // The student is unknown or revoked; those cases must not be distinguished.
  "ACCESS_EXPIRED", // The student's separately managed access validity has ended.
  "NOT_ENTITLED", // The student lacks entitlement to the requested exam or mode.
  "PACKAGE_NOT_FOUND", // No active package exists for the assigned exam/mode/version.
  "DEVICE_LIMIT_REACHED", // The student already has a different active device.
  "DEVICE_KEY_MISMATCH", // A known device ID is presented with a different public key.
  "VERSION_NOT_ASSIGNED", // The requested package version differs from the assigned version.
  "TICKET_ALREADY_USED", // A one-time key-release ticket has already been redeemed.
  "TICKET_INVALID", // A ticket is unknown, expired, or cancelled.
  "RATE_LIMITED", // The caller exceeded an endpoint rate limit.
  "UPSTREAM_UNAVAILABLE", // A required upstream service could not complete the request.
  "INTERNAL_ERROR", // A safe catch-all for unexpected server failures.
]);

// Define the standard JSON error envelope; strict objects reject undocumented fields.
export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: apiErrorCodeSchema, // Machine-readable value used by client-side error mapping.
        message: z.string(), // Safe display text that must not reveal implementation details.
        requestId: z.string().min(1), // Correlation value for support logs.
      })
      .strict(), // Reject undocumented properties in the nested error object.
  })
  .strict(); // Reject undocumented top-level properties too.

// Describe exactly what the M1 authorization stub accepts from a client.
export const authorizeRequestSchema = z
  .object({
    email: z.string().trim().email().max(320), // Normalize surrounding whitespace and require an email-shaped value.
    deviceId: z.string().min(1).max(128), // Require a bounded, non-empty client device identifier.
    devicePublicKey: z.string().min(1).max(2048), // Accept the encoded public key; M1 does not cryptographically inspect it.
  })
  .strict(); // Reject client-supplied fields such as unrestricted exam or version choices.

// Define the intentionally non-production response returned by M1 authorization.
export const authorizeM1ResponseSchema = z
  .object({
    status: z.literal("stub"), // Makes placeholder behavior explicit to client developers.
    entitlements: z.tuple([]), // M1 grants no exams and returns no lease.
  })
  .strict(); // Prevent accidental production-looking fields from being added silently.

// Validate only the query keys documented for the optional content-version endpoint.
export const contentVersionQuerySchema = z
  .object({
    examCode: z.string().min(1).max(64), // Identifies the requested exam using a bounded code.
    mode: contentModeSchema, // Restricts the request to the documented Exam or Prep mode.
  })
  .strict(); // Reject unknown query parameter names.

// Define the M1 placeholder response separately from any future production response.
export const contentVersionM1ResponseSchema = z
  .object({
    status: z.literal("stub"), // States that this is not a package-assignment decision.
    examCode: z.string(), // Echoes the validated request value for client wiring tests.
    mode: contentModeSchema, // Echoes the validated requested mode.
  })
  .strict(); // Reject package fields until their final shared contract is agreed.

// Validate the public health payload and require a UTC-compatible ISO date string.
export const healthResponseSchema = z
  .object({
    status: z.literal("ok"), // Indicates the Worker can answer a health request.
    apiVersion: z.literal("1"), // Identifies the current API version.
    time: z.string().datetime({ offset: true }), // Requires an ISO 8601 timestamp with timezone information.
  })
  .strict(); // Keep the health response minimal and stable.

// Derive TypeScript types from the schemas so runtime validation and compile-time types stay aligned.
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>; // Canonical set of API error identifiers.
export type ApiError = z.infer<typeof apiErrorSchema>; // Standard JSON error body shape.
export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>; // Authorization request body shape.
export type AuthorizeM1Response = z.infer<typeof authorizeM1ResponseSchema>; // M1-only authorization response shape.
export type ContentMode = z.infer<typeof contentModeSchema>; // Supported exam content modes.
export type ContentVersionM1Response = z.infer<typeof contentVersionM1ResponseSchema>; // M1-only version response shape.
export type HealthResponse = z.infer<typeof healthResponseSchema>; // Public health response shape.
