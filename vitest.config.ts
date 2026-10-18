import { cloudflareTest } from "@cloudflare/vitest-plugin"; // Runs each test inside the Cloudflare Workers runtime.
import { defineConfig } from "vitest/config"; // Provides typed Vitest/Vite configuration.

// Export the Vite configuration consumed by the Vitest command.
export default defineConfig({
  // Install Cloudflare's test plugin to emulate Worker runtime behavior.
  plugins: [
    // Reuse the same bindings and Worker entry point as local/deployed Wrangler config.
    cloudflareTest({
      // Point tests at the development Worker configuration for consistent runtime settings.
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  // Narrow test discovery to the API's test folder.
  test: {
    // Run only TypeScript test files ending in .test.ts under test/.
    include: ["test/**/*.test.ts"],
  },
});
