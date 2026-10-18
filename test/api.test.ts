import { describe, expect, it } from "vitest"; // Supplies the test grouping and assertion functions.
import { app } from "../src/index.ts"; // Import the router directly so tests need no running server.

// Reuse the required app identity headers for requests to business endpoints.
const appHeaders = {
  "X-App-Version": "0.1.0", // Represents the version of the app making this test request.
  "X-Platform": "android", // Uses one of the supported platform labels.
};

// Group behavior checks for the intentionally limited M1 routes.
describe("M1 API stubs", () => {
  // Prove health is public and does not require app headers or a database binding.
  it("serves health without app headers or a database", async () => {
    // Hono's in-memory request helper invokes the route without opening a port.
    const response = await app.request("/api/health");
    // Treat parsed JSON as unknown until assertions inspect the expected fields.
    const body: unknown = await response.json();

    // Health should be a successful response and include its correlation header.
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    // Check the stable health fields while leaving the timestamp value dynamic.
    expect(body).toMatchObject({ status: "ok", apiVersion: "1" });
    // Confirm the time looks like an ISO timestamp returned by the Worker.
    expect((body as { time: string }).time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // Ensure business routes reject callers that omit either required app header.
  it("rejects missing required app headers", async () => {
    // Send a structurally valid body but omit X-App-Version and X-Platform.
    const response = await app.request("/api/v1/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "student@example.com", // Supply an email-shaped value for request validation.
        deviceId: "device-1", // Supply a non-empty test device identifier.
        devicePublicKey: "public-key", // Supply a placeholder; M1 does not inspect its cryptography.
      }),
    });

    // The request fails at shared header validation and uses the standard error code.
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  // Check both authorization request validation and its explicit stub result.
  it("validates authorization input and returns an explicit M1 stub", async () => {
    // Send the documented JSON shape with all required app headers.
    const response = await app.request("/api/v1/authorize", {
      method: "POST",
      headers: { ...appHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "student@example.com", // Email must pass Zod's email validation.
        deviceId: "device-1", // Identifies the requesting device in the contract.
        devicePublicKey: "public-key", // Placeholder public-key text for this non-cryptographic milestone.
      }),
    });

    // The route succeeds as a stub and grants no access or lease.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "stub", entitlements: [] });
  });

  // Protect the contract from silently accepting client-selected business fields.
  it("rejects unknown authorization fields", async () => {
    // Add an exam choice that is not in the authorization request schema.
    const response = await app.request("/api/v1/authorize", {
      method: "POST",
      headers: { ...appHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "student@example.com", // Valid baseline identity input.
        deviceId: "device-1", // Valid baseline device input.
        devicePublicKey: "public-key", // Valid placeholder public key.
        examCode: "UNTRUSTED", // Unknown field must be rejected rather than trusted.
      }),
    });

    // Strict Zod object validation should reject the extra examCode field.
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  // Enforce the documented JSON media type before parsing authorization input.
  it("requires JSON content type for authorization", async () => {
    // The body resembles JSON but is sent with an incorrect declared media type.
    const response = await app.request("/api/v1/authorize", {
      method: "POST",
      headers: { ...appHeaders, "Content-Type": "text/plain" },
      body: "{}",
    });

    // The request is rejected without attempting normal authorization processing.
    expect(response.status).toBe(400);
  });

  // Verify the protected-route boundary and the M1-only response behavior.
  it("requires a bearer header and returns only an M1 version stub", async () => {
    // A protected route without an Authorization header must fail.
    const missingLease = await app.request(
      "/api/v1/content/version?examCode=DEMO&mode=exam",
      { headers: appHeaders },
    );
    // The stub reports the absent bearer as a lease-related error.
    expect(missingLease.status).toBe(401);

    // Any non-empty bearer value passes M1 presence checking; it is not verified as a token.
    const response = await app.request(
      "/api/v1/content/version?examCode=DEMO&mode=exam",
      { headers: { ...appHeaders, Authorization: "Bearer m1-placeholder" } },
    );

    // The response echoes validated parameters and explicitly identifies itself as a stub.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "stub",
      examCode: "DEMO",
      mode: "exam",
    });
  });

  // Confirm the mode enum prevents unsupported business values.
  it("rejects invalid content version queries", async () => {
    // 'unknown' is not one of the allowed 'exam' or 'prep' modes.
    const response = await app.request(
      "/api/v1/content/version?examCode=DEMO&mode=unknown",
      { headers: { ...appHeaders, Authorization: "Bearer m1-placeholder" } },
    );

    // Invalid query values must not reach response construction.
    expect(response.status).toBe(400);
  });

  // Confirm the strict query schema rejects undocumented parameter names.
  it("rejects unknown content version query parameters", async () => {
    // The extra query parameter is intentionally outside the shared contract.
    const response = await app.request(
      "/api/v1/content/version?examCode=DEMO&mode=exam&unexpected=value",
      { headers: { ...appHeaders, Authorization: "Bearer m1-placeholder" } },
    );

    // Strict parsing returns the normal safe invalid-request error.
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });
});
