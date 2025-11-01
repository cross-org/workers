/**
 * Test worker that throws errors for testing error handling
 */

import { setupWorker } from "../mod.ts";

setupWorker((data) => {
  const { seq, payload } = data;
  const p = payload as { shouldError?: boolean; errorMessage?: string };

  if (p.shouldError) {
    throw new Error(p.errorMessage || "Test error");
  }

  return { seq, payload: { processed: payload } };
});
