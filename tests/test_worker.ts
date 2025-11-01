/**
 * Test worker for unit testing
 * Echoes back the payload with sequence number
 */

import { setupWorker } from "../mod.ts";

setupWorker((data) => {
  const { seq, payload } = data;
  return { seq, payload };
});
