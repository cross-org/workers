/**
 * Cross-runtime worker setup utility
 * Handles the differences between Node.js worker_threads and Web Workers
 */

import { CurrentRuntime, Runtime } from "@cross/runtime";
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
  const handleMessage = async (data: { seq: number; payload: unknown }) => {
    try {
      const result = handler(data);
      const resolvedResult = result instanceof Promise ? await result : result;
      if (resolvedResult !== undefined) {
        return resolvedResult;
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
  let isNodeJsWorker = false;

  const processMessage = async (data: unknown) => {
    const result = await handleMessage(
      data as { seq: number; payload: unknown },
    );
    if (result !== undefined && postMessageFn) {
      postMessageFn(result);
    }
  };

  // @ts-ignore - self exists in worker context
  const hasSelf = typeof self !== "undefined";

  (async () => {
    if (CurrentRuntime === Runtime.Node) {
      try {
        const workerThreads = await import("node:worker_threads");
        const { parentPort } = workerThreads;
        if (parentPort) {
          isNodeJsWorker = true;

          if (hasSelf) {
            // @ts-ignore - self exists in worker context
            self.onmessage = null;
          }

          postMessageFn = (msg: unknown) => {
            try {
              parentPort.postMessage(msg);
            } catch {
              // Ignore errors if parentPort is closed
            }
          };

          for (const msg of messageQueue) {
            await processMessage(msg);
          }
          messageQueue.length = 0;

          parentPort.on("message", (data: unknown) => {
            processMessage(data);
          });
          return;
        }
      } catch (_error) {
        // Fall back to self.onmessage if worker_threads unavailable
      }
    }
  })();

  if (hasSelf) {
    // @ts-ignore - self exists in worker context
    postMessageFn = (msg: unknown) => self.postMessage(msg);

    // @ts-ignore - self exists in worker context
    self.onmessage = (event: MessageEvent) => {
      // Guard handles race condition where messages arrive before async Node.js check completes
      if (!isNodeJsWorker) {
        processMessage(event.data);
      } else {
        // Queue messages that arrived via self.onmessage to be processed by parentPort
        messageQueue.push(event.data);
      }
    };
  } else {
    try {
      if (typeof console !== "undefined" && console.error) {
        console.error(
          "[setupWorker] No worker API available (neither self nor parentPort)",
        );
      }
    } catch {
      // Ignore
    }
  }
}
