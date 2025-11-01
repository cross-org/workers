/**
 * @cross/workers - Cross-runtime worker pool implementation
 *
 * A library for managing worker pools across Node.js, Deno, Bun, and Browser runtimes.
 */

export { createWorker } from "./src/create_worker.ts";
export { WorkerPool } from "./src/worker_pool.ts";
export { getCPUCount } from "./src/cpu_count.ts";
export { setupWorker } from "./src/setup_worker.ts";
export type {
  WorkerJob,
  WorkerLike,
  WorkerMessageHandler,
  WorkerPoolOptions,
  WorkerResult,
} from "./src/types.ts";
