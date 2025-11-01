/**
 * Cross-runtime worker creation helper
 * Supports Node.js (worker_threads), Deno, Bun, and Browser workers
 */

import { CurrentRuntime, Runtime } from "@cross/runtime";
import type { WorkerLike } from "./types.ts";

// WeakMaps to store handlers for Node.js workers without modifying the worker object
const messageHandlers = new WeakMap<
  object,
  ((event: MessageEvent) => void) | null
>();
const errorHandlers = new WeakMap<
  object,
  ((event: ErrorEvent) => void) | null
>();

/**
 * Create a worker instance appropriate for the current runtime
 */
export async function createWorker(
  moduleUrl: string | URL,
): Promise<WorkerLike> {
  const url = typeof moduleUrl === "string"
    ? new URL(moduleUrl, import.meta.url)
    : moduleUrl;

  if (CurrentRuntime === Runtime.Node) {
    // Node.js: Use worker_threads
    const { Worker } = await import("node:worker_threads");
    const process = await import("node:process");
    let filePath: string;
    if (url.protocol === "file:") {
      filePath = url.pathname;
      // On Windows, remove leading slash from file:///C:/path -> C:/path
      if (process.platform === "win32" && filePath.startsWith("/")) {
        filePath = filePath.slice(1);
      }
    } else {
      filePath = url.href;
    }

    const worker = new Worker(filePath);

    // Wrap Node.js Worker to match WorkerLike interface
    // Node.js uses .on('message') instead of .onmessage
    const wrapped: WorkerLike = {
      postMessage: (message: unknown, transfer?: Transferable[]) => {
        // Node.js worker_threads expects readonly Transferable[] (Node.js types) but Web Worker API uses Transferable[] (Web API types)
        // These are incompatible types at compile time but compatible at runtime
        // @ts-expect-error - Type mismatch between Node.js worker_threads.Transferable and Web Worker Transferable
        worker.postMessage(message, transfer);
      },
      get onmessage() {
        // Return current handler if set
        return messageHandlers.get(worker) || null;
      },
      set onmessage(handler: ((event: MessageEvent) => void) | null) {
        if (handler) {
          // Store handler in WeakMap
          messageHandlers.set(worker, handler);
          // Set up Node.js event listener
          worker.on("message", (data: unknown) => {
            // Create a MessageEvent-like object
            handler({ data } as MessageEvent);
          });
        } else {
          // Remove handler
          messageHandlers.delete(worker);
          worker.removeAllListeners("message");
        }
      },
      get onerror() {
        return errorHandlers.get(worker) || null;
      },
      set onerror(handler: ((event: ErrorEvent) => void) | null) {
        if (handler) {
          errorHandlers.set(worker, handler);
          worker.on("error", (error: Error) => {
            handler({ error, message: error.message } as ErrorEvent);
          });
        } else {
          errorHandlers.delete(worker);
          worker.removeAllListeners("error");
        }
      },
      terminate: async () => {
        await worker.terminate();
      },
    };

    return wrapped;
  } else if (
    CurrentRuntime === Runtime.Deno || CurrentRuntime === Runtime.Browser ||
    CurrentRuntime === Runtime.Bun
  ) {
    // Deno, Bun, and Browser: Use standard Worker API
    return new Worker(url.href, {
      type: "module",
    }) as unknown as WorkerLike;
  } else {
    throw new Error(`Unsupported runtime: ${CurrentRuntime}`);
  }
}
