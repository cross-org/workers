/**
 * Cross-runtime worker setup utility
 * Handles the differences between Node.js worker_threads and Web Workers
 */

import type { WorkerMessageHandler } from "./types.ts";

/**
 * Setup a cross-runtime worker message handler
 * Works in Node.js (worker_threads), Deno, Bun, and Browser
 *
 * @param handler - Function that processes messages and returns results
 *
 * @example
 * ```typescript
 * import { setupWorker } from "@cross/workers";
 *
 * setupWorker((data) => {
 *   const { seq, payload } = data;
 *   // Process the job
 *   const result = processData(payload);
 *   return { seq, ...result };
 * });
 * ```
 */
export function setupWorker(handler: WorkerMessageHandler): void {
  // Create message handler function
  const handleMessage = (data: { seq: number; payload: unknown }) => {
    try {
      const result = handler(data);
      if (result !== undefined) {
        return result;
      }
    } catch (error) {
      return {
        seq: data.seq,
        type: "ERROR",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const messageQueue: unknown[] = [];
  let postMessageFn: ((msg: unknown) => void) | null = null;

  const processMessage = (data: unknown) => {
    const result = handleMessage(data as { seq: number; payload: unknown });
    if (result !== undefined && postMessageFn) {
      postMessageFn(result);
    }
  };

  // Check if self exists (Browser/Deno/Bun)
  // @ts-ignore - self exists in worker context
  const hasSelf = typeof self !== "undefined";

  if (hasSelf) {
    // Set up self.onmessage immediately
    // @ts-ignore - self exists in worker context
    postMessageFn = (msg: unknown) => self.postMessage(msg);
    // @ts-ignore - self exists in worker context
    self.onmessage = (event: MessageEvent) => {
      processMessage(event.data);
    };
  }

  (async () => {
    try {
      // @ts-ignore - dynamic import for Node.js
      const workerThreads = await import("node:worker_threads");
      // @ts-ignore - parentPort exists in Node.js worker context
      const { parentPort } = workerThreads;
      if (parentPort) {
        postMessageFn = (msg: unknown) => {
          try {
            parentPort.postMessage(msg);
          } catch {
            // Ignore errors if parentPort is closed
          }
        };

        for (const msg of messageQueue) {
          processMessage(msg);
        }
        messageQueue.length = 0;

        parentPort.on("message", (data: unknown) => {
          processMessage(data);
        });
        return;
      }
    } catch (err) {
      if (!hasSelf) {
        try {
          if (typeof console !== "undefined" && console.error) {
            console.error(
              "[setupWorker] Failed to set up Node.js worker:",
              err,
            );
          }
        } catch {
          // Ignore console errors
        }
      }
    }
  })();
}
