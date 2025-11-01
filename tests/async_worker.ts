/**
 * Test worker that does async work
 */

import { setupWorker } from "../mod.ts";

setupWorker(async (data) => {
  const { seq, payload } = data;
  // Simulate async work
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { seq, payload: { async: true, original: payload } };
});
