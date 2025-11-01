# @cross/workers

[![JSR Version](https://jsr.io/badges/@cross/workers)](https://jsr.io/@cross/workers)

A cross-runtime worker pool implementation for Node.js, Deno, Bun, and Browser
environments.

## Features

Supports Node.js, Deno, Bun, and Browser runtimes. Workers are distributed using
round-robin scheduling. TypeScript generics provide type safety for job payloads
and results. The maxInflight option limits concurrent in-flight jobs. Jobs are
submitted via post() with results handled through onResult, onError, and
onAllComplete callbacks.

## Installation

```bash
# Deno
deno add jsr:@cross/workers

# Node.js
npx jsr add @cross/workers

# Bun
bunx jsr add @cross/workers
```

## Quick Start

```typescript
import { WorkerPool } from "@cross/workers";

// Define your result type
interface TaskResult {
  id: string;
  success: boolean;
  value: number;
  timestamp: number;
}

// Create a typed worker pool
const pool = new WorkerPool<TaskResult>({
  workers: 4, // Number of workers
  moduleUrl: new URL("./worker.ts", import.meta.url),
});

pool.onResult = async (result) => {
  // result.payload is typed as TaskResult
  console.log(`Job ${result.seq} completed:`, result.payload.value);
};

// Set up error handler
pool.onError = (error, seq) => {
  console.error(`Job ${seq} failed:`, error);
};

// Initialize the pool
await pool.init();

// Post jobs to workers
for (let i = 0; i < 100; i++) {
  await pool.post({
    seq: i,
    payload: { taskId: `task-${i}`, input: i },
  });
}

// Clean up when done
// Use waitForCompletion: true to wait for all jobs to finish before closing
await pool.close(true);

// Or check current in-flight jobs
console.log(`Jobs in flight: ${pool.inflightCount}`);
```

## Worker Module

Your worker module should handle messages and post results. Use the
`setupWorker` helper for cross-runtime compatibility (works in Node.js, Deno,
Bun, and Browser):

```typescript
// worker.ts
import { setupWorker } from "@cross/workers";

function processData(data: unknown) {
  // Your processing logic here
  return { processed: data };
}

// Setup cross-runtime worker handler
setupWorker((data) => {
  const { seq, payload } = data;
  const result = processData(payload);
  return { seq, ...result };
});
```

The `setupWorker` function handles all the runtime differences automatically.
Your handler receives `{ seq, payload }` and should return the result object
(which will be sent back with the sequence number).

Errors are automatically caught and sent back with the `ERROR` type format.

## Determining Worker Count

The optimal number of workers depends on your workload and hardware. For
CPU-bound tasks, use one worker per logical CPU core. For I/O-bound tasks, you
can use more workers since they spend time waiting.

Use the `getCPUCount()` helper function:

```typescript
import { getCPUCount, WorkerPool } from "@cross/workers";

const cpuCount = await getCPUCount();
const workers = cpuCount; // For CPU-bound: match CPU count
// const workers = cpuCount * 2; // For I/O-bound: can use more

const pool = new WorkerPool({
  workers,
  moduleUrl: new URL("./worker.ts", import.meta.url),
});
```

For CPU-bound workloads, match the number of workers to CPU cores. For I/O-bound
workloads (network, file operations), you can use 2-4x the CPU count since
workers are waiting most of the time.

## Examples

See the [`examples/`](./examples/) folder for complete working examples:

- **[Simple Factorial](./examples/simple_factorial/)** - Basic worker pool usage
  with parallel calculations
- **[Data Processing](./examples/data_processing/)** - Advanced usage with async
  result handling and custom `maxInflight`
- **[CSV Streaming](./examples/csv_streaming/)** - Maintain row order when
  processing large CSV files with workers

Each example includes both the main file and worker implementation. Run them
with:

```bash
deno run --allow-read examples/<example_name>/main.ts
```

See [`examples/README.md`](./examples/README.md) for detailed descriptions and
usage.

## API Reference

### `WorkerPool`

Main class for managing a pool of workers.

#### Constructor

```typescript
new WorkerPool<TResult = unknown>(options: WorkerPoolOptions)
```

**Generic Type Parameter:**

- `TResult` - The type of result payload returned by workers. Defaults to
  `unknown`. Specify a type for full type safety.

#### Type Safety

For better type safety, specify the result type:

```typescript
interface MyResult {
  id: string;
  value: number;
}

const pool = new WorkerPool<MyResult>({ ... });
pool.onResult = (result) => {
  // result.payload is typed as MyResult
  console.log(result.payload.id);
};
```

#### Options

```typescript
interface WorkerPoolOptions {
  workers: number; // Number of workers in pool
  moduleUrl: string | URL; // URL to worker module
  maxInflight?: number; // Max concurrent jobs in flight (default: workers * 2)
}
```

**`maxInflight` explained:**

- Controls the maximum number of jobs that can be "in flight" (submitted but not
  yet completed) at any time
- Acts as a backpressure mechanism: if you try to `post()` a job when
  `maxInflight` jobs are already pending, it will wait until capacity is
  available
- Default is `workers * 2`, allowing each worker to have 2 jobs queued (good
  balance between throughput and memory)
- Lower values: Less memory usage, more waiting. Higher values: More
  parallelism, but more memory pressure
- Example: With `workers: 4` and `maxInflight: 5`, only 5 jobs can be pending
  even though you have 4 workers

#### Methods

- `init(): Promise<void>` - Initialize the worker pool
- `post(job: WorkerJob): Promise<void>` - Post a job to a worker
- `broadcast(message: unknown): Promise<void>` - Broadcast message to all
  workers
- `waitForCapacity(): Promise<void>` - Wait until pool has capacity for a new
  job
- `waitForCompletion(): Promise<void>` - Wait until all in-flight jobs have
  completed
- `close(waitForCompletion?: boolean): Promise<void>` - Close all workers and
  clean up. If `waitForCompletion` is true, waits for all in-flight jobs to
  complete before closing (default: false)

#### Properties

- `inflightCount: number` - Read-only property returning the current number of
  in-flight jobs
- `onResult?: (result: WorkerResult) => void | Promise<void>` - Called when a
  job completes
- `onError?: (error: unknown, seq?: number) => void` - Called when a job fails
- `onAllComplete?: () => void | Promise<void>` - Called when all in-flight jobs
  have completed

### `createWorker`

Utility function to create a worker appropriate for the current runtime.

```typescript
import { createWorker } from "@cross/workers";

const worker = await createWorker(new URL("./worker.ts", import.meta.url));
```

### `getCPUCount`

Get the number of logical CPU cores available on the current system. Works
across Node.js, Deno, Browser, and Bun runtimes.

```typescript
import { getCPUCount } from "@cross/workers";

const cpuCount = await getCPUCount();
// Returns the number of CPU cores, or 4 as fallback
```

**Returns:** `Promise<number>` - The number of logical CPU cores

### `setupWorker`

Setup a cross-runtime worker message handler. Automatically handles the
differences between Node.js `worker_threads` and Web Workers.

```typescript
import { setupWorker } from "@cross/workers";

setupWorker((data) => {
  const { seq, payload } = data;
  // Process the job
  const result = processData(payload);
  return { seq, ...result };
});
```

**Parameters:**

- `handler: WorkerMessageHandler` - Function that processes messages and returns
  results

**Behavior:**

- Automatically detects runtime and uses appropriate API (parentPort for
  Node.js, self for others)
- Catches errors and sends them back with `ERROR` type format
- Sends the handler's return value back to the main thread

### Types

```typescript
interface WorkerJob<T = unknown> {
  seq: number;
  payload: T;
  transfer?: Transferable[];
}

interface WorkerResult<T = unknown> {
  seq: number;
  payload: T;
}

interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate?: () => void | Promise<void>;
  close?: () => void;
}

type WorkerMessageHandler = (data: {
  seq: number;
  payload: unknown;
}) => unknown;
```

## License

MIT
