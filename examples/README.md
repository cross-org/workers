# Examples

### Simple Factorial Example

Demonstrates basic worker pool usage by calculating factorials:

```bash
deno run --allow-read examples/simple_factorial/main.ts
```

This example:

- Creates a worker pool with 4 workers
- Calculates factorials for multiple numbers in parallel
- Collects and displays results

**Files:**

- `simple_factorial/main.ts` - Main example file
- `simple_factorial/worker.ts` - Worker implementation

### Data Processing Example

Shows advanced usage with parallel data processing:

```bash
deno run --allow-read examples/data_processing/main.ts
```

This example:

- Processes multiple datasets in parallel
- Uses custom `maxInflight` configuration
- Handles async result processing
- Displays processing statistics

**Files:**

- `data_processing/main.ts` - Main example file
- `data_processing/worker.ts` - Worker implementation

### CSV Streaming Example

Demonstrates how to maintain row order when processing large CSV files with
workers:

```bash
deno run --allow-read examples/csv_streaming/main.ts
```

This example:

- Streams CSV content in batches to workers
- Maintains row order using sequence numbers (`seq`)
- Uses a `pendingResults` Map to store out-of-order results
- Implements `flushInOrder()` to process results sequentially
- Shows both ordered and out-of-order processing modes

**Key Pattern:**

```typescript
// Track order with sequence numbers
const pendingResults = new Map<number, ParsedBatch>();
let nextSeq = 0;

pool.onResult = async (result) => {
  if (preserveOrder) {
    pendingResults.set(result.payload.seq, result.payload);
    await flushInOrder(); // Process results in order
  } else {
    // Process immediately, order doesn't matter
  }
};

const flushInOrder = async () => {
  while (pendingResults.has(nextSeq)) {
    const batch = pendingResults.get(nextSeq)!;
    pendingResults.delete(nextSeq);
    // Process batch...
    nextSeq++;
  }
};
```

**Files:**

- `csv_streaming/main.ts` - Main example demonstrating order preservation
- `csv_streaming/worker.ts` - CSV batch parsing worker

### Browser Example

Interactive browser-based factorial calculator using Web Workers:

```bash
# Example to serve via Deno
deno run --allow-net --allow-read jsr:@std/http/file-server examples/browser_factorial --port 8000
```

Then open `http://localhost:8000` in your browser.

**Files:**

- `browser_factorial/index.html` - Interactive HTML page with embedded script
- `browser_factorial/worker.js` - Worker implementation for browser

**Note:** This example must be served over HTTP/HTTPS (not `file://`) because
browsers require this for Web Workers.
