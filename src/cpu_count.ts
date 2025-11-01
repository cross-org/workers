/**
 * Cross-runtime CPU count detection
 * Returns the number of logical CPU cores available
 * Supports Node.js, Deno, Bun, and Browser runtimes
 */

import { CurrentRuntime, Runtime } from "@cross/runtime";

/**
 * Get the number of logical CPU cores available on the current system.
 * Works across Node.js, Deno, Browser, and Bun runtimes.
 *
 * @returns The number of CPU cores, or 4 as a fallback if detection fails
 */
export async function getCPUCount(): Promise<number> {
  if (CurrentRuntime === Runtime.Node) {
    // Node.js: Use os.cpus()
    const os = await import("node:os");
    return os.cpus().length;
  } else if (
    CurrentRuntime === Runtime.Deno || CurrentRuntime === Runtime.Browser ||
    CurrentRuntime === Runtime.Bun
  ) {
    // Deno, Bun, and Browser: Use navigator.hardwareConcurrency
    if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
      return navigator.hardwareConcurrency;
    }
  }

  // Fallback: Return 4 if detection fails
  return 4;
}
