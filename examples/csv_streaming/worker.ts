/**
 * CSV Batch Processing Worker
 *
 * Processes CSV batches sent from the main thread.
 * Returns parsed data with sequence number to maintain order.
 */

// deno-lint-ignore no-import-prefix
import { setupWorker } from "jsr:@cross/workers@^0.1.3";

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

/**
 * Parse a CSV batch
 */
function parseCsvBatch(batch: CsvBatch): ParsedBatch {
  const columns = batch.header.split(",").map((c) => c.trim());
  const data: string[][] = [];

  for (const line of batch.lines) {
    if (line.trim().length === 0) continue;
    const values = line.split(",");
    data.push(values);
  }

  const result = {
    seq: batch.seq,
    rowsProcessed: data.length,
    columns,
    data,
  };

  if (!result.columns || result.columns.length === 0) {
    throw new Error(
      `No columns found in batch ${batch.seq}. Header: "${batch.header}"`,
    );
  }

  return result;
}

setupWorker((data) => {
  const { payload } = data;
  const batch = payload as CsvBatch;
  return parseCsvBatch(batch);
});
