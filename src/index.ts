import { zValidator } from "@hono/zod-validator"; // Connects Zod schemas to Hono route validation.
import { Hono } from "hono"; // Provides the router and typed request context used by this Worker.
import {
  apiErrorCodeSchema, // Supplies the canonical error-code vocabulary shared with the client.
  authorizeM1ResponseSchema, // Validates the deliberately limited M1 authorization stub.
  authorizeRequestSchema, // Validates the JSON fields accepted by the authorization route.
  contentVersionM1ResponseSchema, // Validates the deliberately limited M1 version response.
  contentVersionQuerySchema, // Validates required version query parameters and rejects extras.
  healthResponseSchema, // Ensures the public health response has the documented shape.
  platformSchema, // Limits platform headers to the supported client platforms.
  type ApiErrorCode, // Gives error responses a compile-time checked shared code.
} from "../shared/api-contract/index.ts";

// Hono stores per-request values in this typed variable map.
interface AppVariables {
  requestId: string; // Correlates a response with its safe operational log entry.
}

// Create the router with the request-ID variable available to every route.
const app = new Hono<{ Variables: AppVariables }>();

// Build the common safe JSON error envelope used by route and framework errors.
function errorResponse(
  code: ApiErrorCode, // The canonical machine-readable error identifier.
  message: string, // A safe description that must not expose secrets or internals.
  requestId: string, // The ID also emitted in the response header and request log.
  status: 400 | 401 | 500, // Only statuses used by this M1 stub are accepted here.
): Response {
  // Keep the response envelope consistent with the shared contract.
  return Response.json(
    {
      error: {
        code, // Lets the application handle the error without parsing prose.
        message, // Gives the caller a safe, human-readable explanation.
        requestId, // Allows support staff to correlate this failure with logs.
      },
    },
    { status }, // Set the HTTP status independently of the JSON error body.
  );
}

// Run common request setup and header checks before any API route handler.
app.use("*", async (context, next) => {
  const requestId = crypto.randomUUID(); // Generate a non-secret identifier for this request.
  context.set("requestId", requestId); // Make the identifier available to later handlers.
  context.header("X-Request-Id", requestId); // Return it in a response header for diagnostics.

  // Bound the logged version value and use a fallback so malformed headers cannot create huge log entries.
  const appVersion = context.req.header("X-App-Version")?.trim().slice(0, 64) || "unknown";
  const platformHeader = context.req.header("X-Platform"); // Read the platform supplied by the native app.
  const platform = platformSchema.safeParse(platformHeader); // Validate before writing the value to logs.
  // Log only request metadata; never include email, device keys, leases, or request bodies.
  console.info(
    JSON.stringify({
      event: "api_request", // Names the structured log event for filtering.
      requestId, // Supports safe error-to-log correlation.
      appVersion, // Captures the caller version required by the API requirements.
      platform: platform.success ? platform.data : "unknown", // Avoids logging invalid platform input.
    }),
  );

  // Health is public and intentionally does not depend on client headers or D1.
  if (context.req.path !== "/api/health") {
    // Every other app route must identify its app version and supported platform.
    if (!context.req.header("X-App-Version")?.trim() || !platform.success) {
      // Stop before route logic and use the standard safe error envelope.
      return context.json(
        {
          error: {
            code: apiErrorCodeSchema.enum.INVALID_REQUEST, // Use the shared request-validation code.
            message: "Required app headers are missing or invalid.", // Do not echo untrusted header values.
            requestId, // Preserve correlation even when rejecting before routing.
          },
        },
        400, // Missing or unsupported required headers are client request errors.
      );
    }
  }

  // Continue through the route chain after common checks succeed.
  await next();
});

// Require JSON specifically on authorization because its request body is a JSON contract.
app.use("/api/v1/authorize", async (context, next) => {
  // Ignore optional parameters such as charset, and compare the media type case-insensitively.
  const contentType = context.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  // Reject other formats before asking the JSON validator to parse the body.
  if (contentType !== "application/json") {
    return errorResponse(
      "INVALID_REQUEST", // Identify the contract violation with a stable code.
      "Content-Type must be application/json.", // Explain the required request representation.
      context.get("requestId"), // Keep the response linked to the request log.
      400, // A media type mismatch is a malformed client request.
    );
  }
  // The content type is valid, so allow the body validator and route to run.
  await next();
});

// Public liveness endpoint: do not read D1 or require app-specific headers here.
app.get("/api/health", (context) => {
  // Validate the response too, so accidental edits cannot silently break its contract.
  const response = healthResponseSchema.parse({
    status: "ok", // Indicates that the Worker process can answer requests.
    apiVersion: "1", // Identifies the current API route family version.
    time: new Date().toISOString(), // Reports the current UTC time in ISO 8601 format.
  });
  // Return the validated health payload as JSON with the default success status.
  return context.json(response);
});

// M1 authorization route validates input but does not perform real authorization.
app.post(
  "/api/v1/authorize",
  // Reject malformed bodies and unknown properties before the handler runs.
  zValidator("json", authorizeRequestSchema, (result, context) => {
    // Convert all schema failures into a generic safe response rather than exposing Zod internals.
    if (!result.success) {
      return errorResponse(
        "INVALID_REQUEST", // Use the shared error code for invalid request content.
        "Request validation failed.", // Keep detailed schema issues out of the public response.
        context.res.headers.get("X-Request-Id") ?? crypto.randomUUID(), // Reuse the middleware ID when available.
        400, // Invalid JSON shape or field values are client errors.
      );
    }
  }),
  // This handler is intentionally a fixed stub until a later milestone implements student lookup and leases.
  (context) => {
    // Validate the fixed response against the M1-only shared schema.
    const response = authorizeM1ResponseSchema.parse({
      status: "stub", // Makes it explicit that this is not a real authorization decision.
      entitlements: [], // The stub grants no exam access and avoids inventing student data.
    });
    // Return the M1 payload; no lease is issued or implied.
    return context.json(response);
  },
);

// M1 content-version route checks bearer-header presence but does not validate a lease.
app.get("/api/v1/content/version", (context) => {
  const requestId = context.get("requestId"); // Reuse the ID created by the common middleware.
  const authorization = context.req.header("Authorization"); // Read the required protected-route header.
  // This presence check is only a stub boundary; it does not verify a JWT or device binding.
  if (!authorization?.startsWith("Bearer ") || !authorization.slice(7).trim()) {
    // Keep the protected-route behavior visible without pretending that real auth exists.
    return errorResponse("LEASE_INVALID", "A bearer lease is required.", requestId, 401);
  }

  // Collect every query pair so the strict Zod object can reject unknown parameter names.
  const queryEntries: [string, string][] = [];
  // URLSearchParams.forEach works with the Worker TypeScript libraries used in this project.
  new URL(context.req.url).searchParams.forEach((value, key) => {
    // Preserve each key/value pair for schema validation.
    queryEntries.push([key, value]);
  });
  // Object.fromEntries produces the plain object expected by the query schema.
  const parsedQuery = contentVersionQuerySchema.safeParse(Object.fromEntries(queryEntries));
  // Reject missing, invalid, or additional query fields before building the response.
  if (!parsedQuery.success) {
    // Do not expose validator internals; the caller receives a stable safe error.
    return errorResponse("INVALID_REQUEST", "Query validation failed.", requestId, 400);
  }

  // Validate the M1-only response shape while echoing the requested identifiers for wiring tests.
  const response = contentVersionM1ResponseSchema.parse({
    status: "stub", // Marks this as placeholder metadata, not an assigned package result.
    examCode: parsedQuery.data.examCode, // Echoes the validated exam requested by the client.
    mode: parsedQuery.data.mode, // Echoes the validated mode requested by the client.
  });
  // Return only the stub values; no entitlement or package availability is asserted.
  return context.json(response);
});

// Give unknown routes a safe shared error instead of a framework-generated HTML response.
app.notFound((context) =>
  // This codebase uses INVALID_REQUEST as its current shared not-found error representation.
  errorResponse("INVALID_REQUEST", "Route not found.", context.get("requestId"), 400),
);

// Hide unexpected exception details and expose only a request-correlated safe error.
app.onError((_error, context) =>
  // Never serialize stack traces, SQL errors, or upstream provider details to the client.
  errorResponse("INTERNAL_ERROR", "An unexpected error occurred.", context.get("requestId"), 500),
);

export { app }; // Expose the Hono app so tests can exercise routes without starting a server.
export default app; // Wrangler uses this default export as the Worker entry point.
