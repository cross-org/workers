/**
 * Shared types for cross-runtime worker pool implementation
 */

/**
 * Worker-like interface that abstracts over different runtime implementations
 */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate?: () => void | Promise<void>;
  close?: () => void;
}

/**
 * Job to be processed by a worker
 */
export interface WorkerJob<T = unknown> {
  /** Sequence number for ordering */
  seq: number;
  /** Message payload to send to worker */
  payload: T;
  /** Transferable objects for zero-copy transfer */
  transfer?: Transferable[];
}

/**
 * Result from a worker
 */
export interface WorkerResult<T = unknown> {
  /** Sequence number matching the job */
  seq: number;
  /** Result payload from worker */
  payload: T;
}

/**
 * Worker pool configuration
 */
export interface WorkerPoolOptions {
  /** Number of workers in the pool */
  workers: number;
  /** Worker module URL */
  moduleUrl: string | URL;
  /** Maximum in-flight jobs (default: workers * 2) */
  maxInflight?: number;
}

/**
 * Message handler function for cross-runtime workers
 */
export type WorkerMessageHandler = (data: {
  seq: number;
  payload: unknown;
}) => unknown;
