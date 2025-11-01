/**
 * Worker pool abstraction for managing multiple workers
 * Provides round-robin job distribution, bounded in-flight queue, and error handling
 */

import type {
  WorkerJob,
  WorkerLike,
  WorkerPoolOptions,
  WorkerResult,
} from "./types.ts";
import { createWorker } from "./create_worker.ts";

/**
 * Worker pool for distributing jobs across multiple workers
 */
export class WorkerPool<TResult = unknown> {
  private workers: WorkerLike[] = [];
  private nextIndex = 0;
  private inflight = 0;
  private maxInflight: number;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private hasPostedJobs = false;

  /** Callback invoked when a worker returns a result */
  onResult?: (result: WorkerResult<TResult>) => void | Promise<void>;
  /** Callback invoked when a worker encounters an error */
  onError?: (error: unknown, seq?: number) => void;
  /** Callback invoked when all in-flight jobs have completed */
  onAllComplete?: () => void | Promise<void>;

  /**
   * Get the current number of in-flight jobs
   */
  get inflightCount(): number {
    return this.inflight;
  }

  private options: WorkerPoolOptions;

  constructor(options: WorkerPoolOptions) {
    this.options = options;
    this.maxInflight = options.maxInflight ?? options.workers * 2;
  }

  /**
   * Initialize the worker pool
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      this.workers = [];
      for (let i = 0; i < this.options.workers; i++) {
        const worker = await createWorker(this.options.moduleUrl);

        worker.onmessage = (ev: MessageEvent) => {
          const data = ev.data as {
            type?: string;
            seq?: number;
            message?: string;
          };

          // Handle ERROR messages from workers
          if (data.type === "ERROR") {
            this.inflight--;
            const error = new Error(data.message || "Worker error");
            this.onError?.(error, data.seq);
            this.checkAllComplete();
            return;
          }

          this.inflight--;
          const result: WorkerResult<TResult> = {
            seq: data.seq ?? -1,
            payload: ev.data as TResult,
          };
          if (this.onResult) {
            // Handle both sync and async onResult handlers
            Promise.resolve(this.onResult(result)).catch((err) => {
              this.onError?.(err, result.seq);
            });
          }
          this.checkAllComplete();
        };

        worker.onerror = (ev: ErrorEvent) => {
          this.inflight--;
          this.onError?.(ev.error || ev.message, undefined);
          this.checkAllComplete();
        };

        this.workers.push(worker);
      }
      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  /**
   * Broadcast a message to all workers
   */
  async broadcast(message: unknown): Promise<void> {
    await this.init();
    for (const worker of this.workers) {
      worker.postMessage(message);
    }
  }

  /**
   * Wait until there's capacity for a new job
   */
  async waitForCapacity(): Promise<void> {
    await this.init();
    while (this.inflight >= this.maxInflight) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Wait until all in-flight jobs have completed
   */
  async waitForCompletion(): Promise<void> {
    await this.init();
    while (this.inflight > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Post a job to a worker (round-robin distribution)
   */
  async post(job: WorkerJob): Promise<void> {
    await this.init();

    await this.waitForCapacity();

    const worker = this.workers[this.nextIndex];
    this.nextIndex = (this.nextIndex + 1) % this.workers.length;
    this.inflight++;
    this.hasPostedJobs = true;

    worker.postMessage(
      { seq: job.seq, payload: job.payload },
      job.transfer ?? [],
    );
  }

  /**
   * Check if all jobs are complete and fire onAllComplete if so
   */
  private checkAllComplete(): void {
    if (this.hasPostedJobs && this.inflight === 0 && this.onAllComplete) {
      // Prevent multiple fires - only fire once when reaching 0
      this.hasPostedJobs = false;
      Promise.resolve(this.onAllComplete()).catch((err) => {
        this.onError?.(err, undefined);
      });
    }
  }

  /**
   * Close all workers in the pool
   * @param waitForCompletion - If true, wait for all in-flight jobs to complete before closing (default: false)
   */
  async close(waitForCompletion = false): Promise<void> {
    await this.init();

    // Optionally wait for all jobs to complete before closing
    if (waitForCompletion) {
      await this.waitForCompletion();
    }

    for (const worker of this.workers) {
      try {
        worker.postMessage({ type: "CLOSE", payload: {} });
      } catch {
        // Worker may already be terminated
      }
    }

    const closePromises = this.workers.map((worker) => {
      if (worker.terminate) {
        return Promise.resolve(worker.terminate());
      }
      if (worker.close) {
        worker.close();
      }
      return Promise.resolve();
    });

    await Promise.all(closePromises);
    this.workers = [];
    this.isInitialized = false;
    this.initPromise = null;
  }
}
