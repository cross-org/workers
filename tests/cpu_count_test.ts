/**
 * Tests for getCPUCount function
 */

import { test } from "@cross/test";
import { assert, assertEquals } from "@std/assert";
import { getCPUCount } from "../mod.ts";

test("getCPUCount: returns a positive number", async () => {
  const count = await getCPUCount();

  assert(count > 0, "CPU count should be positive");
  assert(Number.isInteger(count), "CPU count should be an integer");
});

test("getCPUCount: is consistent", async () => {
  const count1 = await getCPUCount();
  const count2 = await getCPUCount();

  assertEquals(count1, count2, "CPU count should be consistent");
});
