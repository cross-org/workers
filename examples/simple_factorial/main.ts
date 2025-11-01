/**
 * Simple Example: Calculate Factorials Using Worker Pool
 *
 * This example demonstrates basic worker pool usage by calculating
 * factorials of numbers in parallel.
 */

// deno-lint-ignore no-import-prefix
import { WorkerPool } from "jsr:@cross/workers@^0.1.2";

interface FactorialJob {
  number: number;
}

interface FactorialResult {
  number: number;
  factorial: number;
}

// Create results array to collect outputs
const results: FactorialResult[] = [];

// Create worker pool with typed result
const pool = new WorkerPool<FactorialResult>({
  workers: 4,
  moduleUrl: new URL("./worker.ts", import.meta.url),
});

pool.onResult = (result) => {
  const data = result.payload;
  results.push(data);
  console.log(`✓ Factorial of ${data.number} = ${data.factorial}`);
};

// Handle errors
pool.onError = (error, seq) => {
  console.error(`✗ Job ${seq} failed:`, error);
};

// Optional: Listen for when all jobs complete (alternative to waitForCompletion())
// pool.onAllComplete = () => {
//   console.log("\nAll jobs completed!");
//   // Process results here
// };

// Initialize the pool
console.log("Initializing worker pool...");
await pool.init();
console.log("Worker pool ready!\n");

// Submit jobs
const numbers = [10, 15, 20, 25, 30, 35, 40, 45];
console.log(`Calculating factorials for: ${numbers.join(", ")}\n`);

for (let i = 0; i < numbers.length; i++) {
  await pool.post({
    seq: i,
    payload: { number: numbers[i] } as FactorialJob,
  });
}

// Wait for all jobs to complete
await pool.waitForCompletion();

// Sort results by number
results.sort((a, b) => a.number - b.number);

console.log("\n--- Results ---");
for (const result of results) {
  console.log(`Factorial(${result.number}) = ${result.factorial}`);
}

// Clean up
await pool.close();
console.log("\nWorker pool closed.");
