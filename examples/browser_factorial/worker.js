/**
 * Worker for calculating factorials
 * Browser-compatible worker using esm.sh imports
 */

import { setupWorker } from "https://esm.sh/jsr/@cross/workers@0.1.3";

console.log("🔧 [Web Worker] Worker thread initialized");

function calculateFactorial(job) {
  const n = job.number;
  console.log(
    `⚙️ [Web Worker] Calculating factorial(${n}) in worker thread...`,
  );

  // Calculate factorial using BigInt for large numbers
  let factorial = 1n;
  for (let i = 2; i <= n; i++) {
    factorial *= BigInt(i);
  }

  const result = Number(factorial);
  console.log(`✅ [Web Worker] Completed factorial(${n}) = ${result}`);

  return {
    number: n,
    factorial: result,
  };
}

// Setup cross-runtime worker handler
setupWorker((data) => {
  const { seq, payload } = data;
  const job = payload;
  console.log(
    `📥 [Web Worker] Received job ${seq}: calculate factorial(${job.number})`,
  );
  const result = calculateFactorial(job);
  console.log(
    `📤 [Web Worker] Sending result for job ${seq} back to main thread`,
  );
  return { seq, ...result };
});
