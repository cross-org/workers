/**
 * Tests for createWorker function
 */

import { test } from "@cross/test";
import { assert, assertEquals } from "@std/assert";
import { createWorker } from "../mod.ts";

test("createWorker: creates a worker in Deno", async () => {
  const worker = await createWorker(
    new URL("./test_worker.ts", import.meta.url),
  );

  assert(worker !== null, "Worker should be created");
  assert(
    typeof worker.postMessage === "function",
    "Worker should have postMessage",
  );
  assert("onmessage" in worker, "Worker should have onmessage property");
  assert("onerror" in worker, "Worker should have onerror property");

  // Clean up
  if (worker.terminate) {
    await worker.terminate();
  }
});

test("createWorker: worker can receive messages", async () => {
  const worker = await createWorker(
    new URL("./test_worker.ts", import.meta.url),
  );

  const messagePromise = new Promise<unknown>((resolve) => {
    worker.onmessage = (event: MessageEvent) => {
      resolve(event.data);
    };
  });

  // Send a message and wait for response
  worker.postMessage({ seq: 1, payload: { test: "data" } });

  // Wait for response (worker echoes back) with timeout
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), 500);
  });

  const receivedMessage = await Promise.race([
    messagePromise.then((msg) => {
      if (timeoutId) clearTimeout(timeoutId);
      return msg;
    }),
    timeoutPromise,
  ]);

  assert(receivedMessage !== null, "Should receive message from worker");
  const msg = receivedMessage as { seq: number; payload: unknown };
  assertEquals(msg.seq, 1);

  // Clean up
  if (worker.terminate) {
    await worker.terminate();
  }
});

test("createWorker: worker can be terminated", async () => {
  const worker = await createWorker(
    new URL("./test_worker.ts", import.meta.url),
  );

  if (worker.terminate) {
    await worker.terminate();
    // Should not throw
    assert(true);
  }
});
