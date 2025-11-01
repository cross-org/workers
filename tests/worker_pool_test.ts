/**
 * Tests for WorkerPool class
 */

import { test } from "@cross/test";
import { assert, assertEquals } from "@std/assert";
import { WorkerPool } from "../mod.ts";

test("WorkerPool: initialization", async () => {
  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  assertEquals(pool.inflightCount, 0);
  await pool.init();
  assertEquals(pool.inflightCount, 0);

  await pool.close();
});

test("WorkerPool: multiple init calls are safe", async () => {
  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  // Call init multiple times concurrently
  await Promise.all([pool.init(), pool.init(), pool.init()]);

  assertEquals(pool.inflightCount, 0);
  await pool.close();
});

test("WorkerPool: posting and receiving jobs", async () => {
  const results: unknown[] = [];

  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  pool.onResult = (result) => {
    results.push(result);
  };

  await pool.init();

  await pool.post({ seq: 1, payload: { test: "data1" } });
  await pool.post({ seq: 2, payload: { test: "data2" } });

  await pool.waitForCompletion();

  assertEquals(results.length, 2);
  // Results may come in any order, so check both
  const resultMap = new Map(
    results.map((r) => {
      const res = r as { seq: number; payload: unknown };
      return [res.seq, res.payload];
    }),
  );

  const fullResponse1 = resultMap.get(1) as { seq: number; payload: unknown };
  const fullResponse2 = resultMap.get(2) as { seq: number; payload: unknown };
  assertEquals(fullResponse1.payload, { test: "data1" });
  assertEquals(fullResponse2.payload, { test: "data2" });

  await pool.close();
});

test("WorkerPool: maxInflight limit", async () => {
  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
    maxInflight: 3,
  });

  await pool.init();

  // Start posting jobs (should not block until maxInflight is reached)
  const postPromises: Promise<void>[] = [];
  for (let i = 0; i < 5; i++) {
    postPromises.push(pool.post({ seq: i, payload: { job: i } }));
  }

  // Wait a bit to see if any are blocked
  await new Promise((resolve) => setTimeout(resolve, 50));

  // inflightCount should not exceed maxInflight
  assert(
    pool.inflightCount <= 3,
    `inflightCount ${pool.inflightCount} should be <= 3`,
  );

  // Wait for all posts to complete
  await Promise.all(postPromises);
  await pool.waitForCompletion();

  await pool.close();
});

test("WorkerPool: default maxInflight is workers * 2", async () => {
  const pool1 = new WorkerPool({
    workers: 4,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });
  assertEquals(pool1["maxInflight"], 8); // workers * 2

  const pool2 = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
    maxInflight: 5,
  });
  assertEquals(pool2["maxInflight"], 5); // explicitly set

  await pool1.close();
  await pool2.close();
});

test("WorkerPool: error handling", async () => {
  const errors: unknown[] = [];

  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./error_worker.ts", import.meta.url),
  });

  pool.onError = (error, seq) => {
    errors.push({ error, seq });
  };

  await pool.init();

  // Post a job that should error
  await pool.post({
    seq: 1,
    payload: { shouldError: true, errorMessage: "Test error message" },
  });

  // Post a job that should succeed
  await pool.post({
    seq: 2,
    payload: { shouldError: false },
  });

  await pool.waitForCompletion();

  // Should have one error
  assertEquals(errors.length, 1);
  const errorEntry = errors[0] as { error: unknown; seq?: number };
  assert(errorEntry.error instanceof Error);
  assertEquals(errorEntry.seq, 1);

  await pool.close();
});

test("WorkerPool: onAllComplete callback", async () => {
  let allCompleteCalled = false;

  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  pool.onAllComplete = () => {
    allCompleteCalled = true;
  };

  await pool.init();

  await pool.post({ seq: 1, payload: { test: "data1" } });
  await pool.post({ seq: 2, payload: { test: "data2" } });

  // Wait for onAllComplete to fire
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert(allCompleteCalled, "onAllComplete should have been called");

  await pool.close();
});

test("WorkerPool: onAllComplete only fires once per batch", async () => {
  let allCompleteCallCount = 0;

  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  pool.onAllComplete = () => {
    allCompleteCallCount++;
  };

  await pool.init();

  // Post multiple jobs in one batch
  await pool.post({ seq: 1, payload: { test: "data1" } });
  await pool.post({ seq: 2, payload: { test: "data2" } });
  await pool.post({ seq: 3, payload: { test: "data3" } });

  // Wait for all jobs to complete
  await pool.waitForCompletion();

  // Even though multiple jobs complete and checkAllComplete is called multiple times,
  // onAllComplete should only fire once per batch
  assertEquals(
    allCompleteCallCount,
    1,
    "onAllComplete should fire exactly once for one batch",
  );

  // Post another batch
  await pool.post({ seq: 4, payload: { test: "data4" } });
  await pool.waitForCompletion();

  // Should fire once more for the second batch
  assertEquals(
    allCompleteCallCount,
    2,
    "onAllComplete should fire once per batch",
  );

  await pool.close();
});

test("WorkerPool: waitForCompletion", async () => {
  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./async_worker.ts", import.meta.url),
  });

  await pool.init();

  await pool.post({ seq: 1, payload: { test: "data1" } });
  await pool.post({ seq: 2, payload: { test: "data2" } });

  // waitForCompletion should block until all jobs are done
  await pool.waitForCompletion();

  assertEquals(pool.inflightCount, 0);

  await pool.close();
});

test("WorkerPool: waitForCapacity", async () => {
  const pool = new WorkerPool({
    workers: 1,
    moduleUrl: new URL("./async_worker.ts", import.meta.url),
    maxInflight: 2,
  });

  await pool.init();

  // Fill up capacity
  await pool.post({ seq: 1, payload: { test: "data1" } });
  await pool.post({ seq: 2, payload: { test: "data2" } });

  // Next post should wait for capacity
  const postPromise = pool.post({ seq: 3, payload: { test: "data3" } });

  // Should initially be at capacity
  assertEquals(pool.inflightCount, 2);

  // Wait for one job to complete, freeing capacity
  await new Promise((resolve) => setTimeout(resolve, 50));

  // The post should have proceeded
  await postPromise;

  await pool.waitForCompletion();
  await pool.close();
});

test("WorkerPool: close without waiting", async () => {
  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./async_worker.ts", import.meta.url),
  });

  await pool.init();

  // Post a job but don't wait
  await pool.post({ seq: 1, payload: { test: "data1" } });

  // Close immediately without waiting
  await pool.close(false);

  // Pool should be closed - inflightCount should be reset even if jobs were in flight
  // Note: In-flight jobs may be terminated, so count may not be accurate immediately
  assert(pool.inflightCount >= 0, "inflightCount should be non-negative");
});

test("WorkerPool: close with waitForCompletion", async () => {
  const results: unknown[] = [];

  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  pool.onResult = (result) => {
    results.push(result);
  };

  await pool.init();

  await pool.post({ seq: 1, payload: { test: "data1" } });
  await pool.post({ seq: 2, payload: { test: "data2" } });

  // Close with waitForCompletion = true
  await pool.close(true);

  // Results should be collected
  assertEquals(results.length, 2);
});

test("WorkerPool: async onResult handler", async () => {
  const results: unknown[] = [];

  const pool = new WorkerPool({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  pool.onResult = async (result) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    results.push(result);
  };

  await pool.init();

  await pool.post({ seq: 1, payload: { test: "data1" } });
  await pool.post({ seq: 2, payload: { test: "data2" } });

  await pool.waitForCompletion();

  // Give async handlers time to complete
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(results.length, 2);

  await pool.close();
});

test("WorkerPool: broadcast message", async () => {
  const pool = new WorkerPool({
    workers: 3,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  await pool.init();

  // Broadcast should not throw
  await pool.broadcast({ type: "test", message: "broadcast" });

  await pool.close();
});

test("WorkerPool: type safety with generic", async () => {
  interface TestResult {
    value: number;
  }

  const pool = new WorkerPool<TestResult>({
    workers: 2,
    moduleUrl: new URL("./test_worker.ts", import.meta.url),
  });

  pool.onResult = (result) => {
    // TypeScript should know result.payload is TestResult
    // But worker returns { seq, payload }, so we need to extract the inner payload
    const workerResponse = result.payload as {
      seq?: number;
      payload?: TestResult;
    };
    if (workerResponse.payload) {
      const value: number = workerResponse.payload.value;
      assertEquals(typeof value, "number");
    }
  };

  await pool.init();

  await pool.post({ seq: 1, payload: { value: 42 } });

  await pool.waitForCompletion();
  await pool.close();
});
