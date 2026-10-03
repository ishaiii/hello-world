/**
 * UI-thread client for the engine worker.
 *
 * - Every request carries a job id; replies for unknown (cancelled or superseded) ids are ignored,
 *   so a slow job can never overwrite newer state.
 * - Cancel is cooperative first (a message the worker checks between chunks of work). If the
 *   worker does not stop promptly it is terminated and recreated, and the loaded files are replayed
 *   from the byte copies kept here.
 * - Source bytes live here once; the worker receives copies.
 */
import type { ProgressInfo, Role } from '../engine/types';
import type { ParseOptions } from '../import/loadFile';
import { isResponse, type Op, type Payloads, type Results } from './protocol';

export class WorkerResetError extends Error {
  constructor(message = 'The background worker was restarted.') {
    super(message);
    this.name = 'WorkerResetError';
  }
}

export class JobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cancelled: boolean,
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export interface Job<T> {
  id: number;
  promise: Promise<T>;
  cancel(): void;
}

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessageerror?: ((e: unknown) => void) | null;
}

interface Pending {
  resolve(v: unknown): void;
  reject(e: unknown): void;
  onProgress?: (p: ProgressInfo) => void;
}

interface Source {
  name: string;
  bytes: ArrayBuffer;
  options: ParseOptions;
}

export class WorkerClient {
  private worker: WorkerLike;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sources: Record<Role, Source | null> = { A: null, B: null };
  /** Called when the worker had to be restarted; the UI should treat results as stale. */
  private onReset: (() => void) | null = null;
  setOnReset(cb: (() => void) | null): void {
    this.onReset = cb;
  }
  resetCount = 0;

  constructor(
    private readonly create: () => WorkerLike,
    private readonly cancelGraceMs = 2000,
  ) {
    this.worker = this.attach(create());
  }

  private attach(w: WorkerLike): WorkerLike {
    w.onmessage = (e) => this.onMessage(e.data);
    w.onerror = () => this.reset('crash');
    w.onmessageerror = () => this.reset('crash');
    return w;
  }

  private onMessage(msg: unknown): void {
    if (!isResponse(msg)) return;
    const p = this.pending.get(msg.id);
    if (!p) return; // stale: cancelled, superseded or from a terminated worker
    if (msg.kind === 'progress') {
      p.onProgress?.(msg.progress);
      return;
    }
    this.pending.delete(msg.id);
    if (msg.kind === 'ok') p.resolve(msg.data);
    else p.reject(new JobError(msg.code, msg.message, msg.cancelled));
  }

  call<K extends Op>(op: K, payload: Payloads[K], opts: { onProgress?: (p: ProgressInfo) => void } = {}): Job<Results[K]> {
    const id = this.nextId++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<Results[K]>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => {
          if (timer) clearTimeout(timer);
          resolve(v as Results[K]);
        },
        reject: (e) => {
          if (timer) clearTimeout(timer);
          reject(e);
        },
        onProgress: opts.onProgress,
      });
    });
    this.track(op, payload);
    const message =
      op === 'loadFile'
        ? { id, op, payload: { ...(payload as Payloads['loadFile']), bytes: (payload as Payloads['loadFile']).bytes.slice(0) } }
        : { id, op, payload };
    this.worker.postMessage(message);
    return {
      id,
      promise,
      cancel: () => {
        if (!this.pending.has(id)) return;
        this.worker.postMessage({ cancel: id });
        timer = setTimeout(() => {
          if (this.pending.has(id)) this.reset('unresponsive');
        }, this.cancelGraceMs);
      },
    };
  }

  /** Remember what is loaded so a restarted worker can be brought back to the same state. */
  private track(op: Op, payload: unknown): void {
    if (op === 'loadFile') {
      const p = payload as Payloads['loadFile'];
      this.sources[p.role] = { name: p.name, bytes: p.bytes, options: p.options };
    } else if (op === 'reparse') {
      const p = payload as Payloads['reparse'];
      const s = this.sources[p.role];
      if (s) s.options = p.options;
    } else if (op === 'removeFile') {
      this.sources[(payload as Payloads['removeFile']).role] = null;
    }
  }

  sourceBytes(role: Role): ArrayBuffer | null {
    return this.sources[role]?.bytes ?? null;
  }

  /** Terminate and recreate the worker, replaying loaded files. Pending jobs fail with WorkerResetError. */
  reset(_reason: 'crash' | 'unresponsive' | 'manual' = 'manual'): void {
    this.resetCount++;
    const err = new WorkerResetError();
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = this.attach(this.create());
    for (const role of ['A', 'B'] as const) {
      const s = this.sources[role];
      if (!s) continue;
      const id = this.nextId++;
      // Replayed silently; the original FileInfo is already known to the UI.
      this.pending.set(id, { resolve: () => undefined, reject: () => undefined });
      this.worker.postMessage({ id, op: 'loadFile', payload: { role, name: s.name, bytes: s.bytes.slice(0), options: s.options } });
    }
    this.onReset?.();
  }

  dispose(): void {
    for (const p of this.pending.values()) p.reject(new WorkerResetError('The workspace was closed.'));
    this.pending.clear();
    this.worker.terminate();
    this.sources = { A: null, B: null };
  }
}

export function createBrowserWorker(): WorkerLike {
  return new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}
