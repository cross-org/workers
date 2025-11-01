/**
 * Worker for processing numerical datasets
 */

// deno-lint-ignore no-import-prefix
import { setupWorker } from "jsr:@cross/workers@^0.1.2";

interface ProcessingJob {
  id: string;
  data: number[];
}

interface ProcessingResult {
  id: string;
  sum: number;
  average: number;
  min: number;
  max: number;
  processedAt: string;
}

setupWorker((data) => {
  const { seq, payload } = data;
  const job = payload as ProcessingJob;

  const { id, data: values } = job;

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const value of values) {
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const average = sum / values.length;

  // Simulate some processing time
  // In real scenarios, this would be actual computation
  const start = Date.now();
  while (Date.now() - start < 50) {
    // Simulate work
  }

  const result: ProcessingResult = {
    id,
    sum,
    average,
    min,
    max,
    processedAt: new Date().toISOString(),
  };

  return { seq, ...result };
});
