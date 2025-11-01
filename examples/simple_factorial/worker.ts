/**
 * Worker for calculating factorials
 * Cross-runtime compatible: works in Node.js, Deno, Bun, and Browser
 */

// deno-lint-ignore no-import-prefix
import { setupWorker } from "jsr:@cross/workers@^0.1.2";

interface FactorialJob {
  number: number;
}

interface FactorialResult {
  number: number;
  factorial: number;
}

function calculateFactorial(job: FactorialJob): FactorialResult {
  const n = job.number;

  let factorial = 1n;
  for (let i = 2; i <= n; i++) {
    factorial *= BigInt(i);
  }

  return {
    number: n,
    factorial: Number(factorial),
  };
}

// Setup cross-runtime worker handler
setupWorker((data) => {
  const { seq, payload } = data;
  const job = payload as FactorialJob;
  const result = calculateFactorial(job);
  return { seq, ...result };
});
