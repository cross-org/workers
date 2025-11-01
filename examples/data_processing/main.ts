/**
 * Advanced Example: Parallel Data Processing
 *
 * This example shows how to process a large dataset in parallel,
 * collecting results and handling errors gracefully.
 */

// deno-lint-ignore no-import-prefix
import { WorkerPool } from "jsr:@cross/workers@^0.1.3";

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

// Create worker pool with typed result and custom max inflight
const pool = new WorkerPool<ProcessingResult>({
  workers: 3,
  moduleUrl: new URL("./worker.ts", import.meta.url),
  maxInflight: 5, // Allow up to 5 jobs in flight
});

// Store results with job IDs for reference
const resultMap = new Map<string, ProcessingResult>();
let completedCount = 0;
let errorCount = 0;

pool.onResult = async (result) => {
  const data = result.payload;
  resultMap.set(data.id, data);
  completedCount++;

  // Simulate async processing of result (e.g., saving to database)
  await new Promise((resolve) => setTimeout(resolve, 10));

  console.log(
    `[${completedCount}] Processed ${data.id}: sum=${data.sum}, avg=${
      data.average.toFixed(2)
    }`,
  );
};

// Handle errors
pool.onError = (error, seq) => {
  errorCount++;
  console.error(`[ERROR] Job ${seq} failed:`, error);
};

// Initialize
console.log("Initializing data processing pool...");
await pool.init();
console.log("Ready to process data!\n");

// Generate sample datasets
const datasets: ProcessingJob[] = [];
for (let i = 0; i < 10; i++) {
  const randomData = Array.from(
    { length: 1000 },
    () => Math.floor(Math.random() * 1000),
  );
  datasets.push({
    id: `dataset-${i + 1}`,
    data: randomData,
  });
}

// Submit all jobs
console.log(`Submitting ${datasets.length} datasets for processing...\n`);

for (let i = 0; i < datasets.length; i++) {
  await pool.post({
    seq: i,
    payload: datasets[i],
  });
}

// Wait for all jobs to complete
console.log("\nWaiting for all jobs to complete...");
await pool.waitForCompletion();

// Display summary
console.log("\n=== Processing Summary ===");
console.log(`Total datasets: ${datasets.length}`);
console.log(`Successfully processed: ${completedCount}`);
console.log(`Errors: ${errorCount}`);

// Show detailed results
console.log("\n=== Detailed Results ===");
for (const [id, result] of resultMap.entries()) {
  console.log(`${id}:`, {
    sum: result.sum,
    average: result.average.toFixed(2),
    range: `${result.min} - ${result.max}`,
  });
}

// Clean up (wait for all jobs to finish before closing)
await pool.close(true);
console.log("\nWorker pool closed.");
