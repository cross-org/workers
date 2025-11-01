/**
 * CSV Streaming Example: Maintaining Row Order
 *
 * This example demonstrates how to stream parse large CSV files using workers
 * while maintaining the original row order, even though workers may complete
 * out of order.
 */

// deno-lint-ignore no-import-prefix
import { getCPUCount, WorkerPool } from "jsr:@cross/workers@^0.1.2";

interface CsvBatch {
  header: string;
  lines: string[];
  seq: number;
}

interface ParsedBatch {
  seq: number;
  rowsProcessed: number;
  columns: string[];
  data: string[][];
}

interface ValidationResult {
  totalRows: number;
  expectedSum: number;
  actualSum: number;
  idsInOrder: number[];
  orderCorrect: boolean;
  allRowsPresent: boolean;
}

/**
 * Example CSV content generator with verifiable cumulative values
 * In real usage, you'd read from a file
 */
function generateSampleCsv(
  lines: number,
): { csv: string; expectedSum: number } {
  const header = "id,value,running_sum";
  const rows: string[] = [];
  let runningSum = 0;

  for (let i = 0; i < lines; i++) {
    const value = i + 1;
    runningSum += value;
    rows.push(`${i},${value},${runningSum}`);
  }

  return {
    csv: header + "\n" + rows.join("\n"),
    expectedSum: runningSum,
  };
}

/**
 * Split CSV content into batches for processing
 */
function splitIntoCsvBatches(
  csvContent: string,
  batchSize: number,
): CsvBatch[] {
  const lines = csvContent.split("\n");
  const header = lines[0];
  const dataLines = lines.slice(1);
  const batches: CsvBatch[] = [];

  for (let i = 0; i < dataLines.length; i += batchSize) {
    batches.push({
      header,
      lines: dataLines.slice(i, i + batchSize),
      seq: Math.floor(i / batchSize),
    });
  }

  return batches;
}

/**
 * Parse CSV with order preservation and validation
 */
async function parseCsvWithOrderPreservation(
  csvContent: string,
  batchSize: number,
  preserveOrder: boolean,
  expectedSum: number,
): Promise<ValidationResult> {
  const batches = splitIntoCsvBatches(csvContent, batchSize);
  const cpuCount = await getCPUCount();
  const workers = Math.max(1, cpuCount - 1);

  const pool = new WorkerPool<ParsedBatch>({
    workers,
    moduleUrl: new URL("./worker.ts", import.meta.url),
    maxInflight: workers * 2,
  });

  // Track order: pendingResults stores results by sequence number
  const pendingResults = new Map<number, ParsedBatch>();
  let nextSeq = 0;
  let batchesCompleted = 0;
  let totalRowsProcessed = 0;

  // Validation tracking
  const processedIds: number[] = [];
  let actualSum = 0;

  /**
   * Flush results in order, starting from nextSeq
   */
  const flushInOrder = () => {
    while (pendingResults.has(nextSeq)) {
      const batch = pendingResults.get(nextSeq)!;
      pendingResults.delete(nextSeq);

      // Process the batch in order
      if (!batch || !batch.columns) {
        console.error(`Invalid batch at seq ${nextSeq}:`, batch);
        nextSeq++;
        continue;
      }

      console.log(
        `[Ordered] Batch ${batch.seq}: ${batch.rowsProcessed} rows`,
      );

      // Validate and accumulate data from this batch
      for (const row of batch.data) {
        const id = parseInt(row[0], 10);
        const value = parseInt(row[1], 10);
        processedIds.push(id);
        actualSum += value;
      }

      totalRowsProcessed += batch.rowsProcessed;
      batchesCompleted++;

      nextSeq++;
    }
  };

  // Handle results - store by sequence number and flush in order if needed
  pool.onResult = (result) => {
    const batch = result.payload;

    if (!batch || typeof batch !== "object") {
      console.error("Invalid batch received:", batch);
      return;
    }

    if (preserveOrder) {
      pendingResults.set(batch.seq, batch);
      flushInOrder();
    } else {
      console.log(
        `[Out-of-order] Batch ${batch.seq}: ${batch.rowsProcessed} rows`,
      );

      // Validate and accumulate data from this batch
      for (const row of batch.data) {
        const id = parseInt(row[0], 10);
        const value = parseInt(row[1], 10);
        processedIds.push(id);
        actualSum += value;
      }

      totalRowsProcessed += batch.rowsProcessed;
      batchesCompleted++;
    }
  };

  pool.onError = (error, seq) => {
    console.error(`Error processing batch ${seq}:`, error);
  };

  await pool.init();

  // Send all batches to workers
  for (const batch of batches) {
    await pool.post({
      seq: batch.seq,
      payload: batch,
    });
  }

  if (preserveOrder) {
    await pool.waitForCompletion();
    flushInOrder();
  } else {
    await pool.waitForCompletion();
  }

  console.log(`\nTotal rows processed: ${totalRowsProcessed}`);
  await pool.close(true);

  const expectedRows = csvContent.split("\n").length - 1;
  const allRowsPresent = totalRowsProcessed === expectedRows;

  let orderCorrect = true;
  if (preserveOrder) {
    for (let i = 0; i < processedIds.length; i++) {
      if (processedIds[i] !== i) {
        orderCorrect = false;
        break;
      }
    }
  }

  return {
    totalRows: totalRowsProcessed,
    expectedSum,
    actualSum,
    idsInOrder: preserveOrder ? processedIds : [],
    orderCorrect,
    allRowsPresent,
  };
}

async function main() {
  console.log("=== CSV Streaming with Order Preservation ===\n");

  // Generate sample CSV with validation data (in real usage, you'd read from a file)
  const { csv: csvContent, expectedSum } = generateSampleCsv(10000);
  const batchSize = 500;
  const expectedRows = csvContent.split("\n").length - 1;

  console.log(`CSV content: ${expectedRows} rows`);
  console.log(`Expected sum of all values: ${expectedSum}`);
  console.log(`Batch size: ${batchSize}\n`);

  console.log("--- With Order Preservation (preserveOrder=true) ---");
  const validation1 = await parseCsvWithOrderPreservation(
    csvContent,
    batchSize,
    true,
    expectedSum,
  );

  console.log("\n--- Validation Results ---");
  console.log(
    `Total rows processed: ${validation1.totalRows} (expected: ${expectedRows})`,
  );
  console.log(
    `Sum of values: ${validation1.actualSum} (expected: ${expectedSum})`,
  );
  console.log(`All rows present: ${validation1.allRowsPresent ? "✓" : "✗"}`);
  console.log(
    `Sum correct: ${validation1.actualSum === expectedSum ? "✓" : "✗"}`,
  );
  if (validation1.orderCorrect) {
    console.log(
      `Order preserved: ✓ (IDs: 0..${validation1.idsInOrder.length - 1})`,
    );
  } else {
    console.log(`Order preserved: ✗`);
    if (
      validation1.idsInOrder.length > 0 && validation1.idsInOrder.length <= 20
    ) {
      console.log(
        `  First IDs received: ${
          validation1.idsInOrder.slice(0, 20).join(", ")
        }`,
      );
    }
  }

  console.log("\n--- Without Order Preservation (preserveOrder=false) ---");
  const validation2 = await parseCsvWithOrderPreservation(
    csvContent,
    batchSize,
    false,
    expectedSum,
  );

  console.log("\n--- Validation Results ---");
  console.log(
    `Total rows processed: ${validation2.totalRows} (expected: ${expectedRows})`,
  );
  console.log(
    `Sum of values: ${validation2.actualSum} (expected: ${expectedSum})`,
  );
  console.log(`All rows present: ${validation2.allRowsPresent ? "✓" : "✗"}`);
  console.log(
    `Sum correct: ${validation2.actualSum === expectedSum ? "✓" : "✗"}`,
  );
  console.log(`(Order not validated in out-of-order mode)`);
}

if (import.meta.main) {
  main().catch(console.error);
}
