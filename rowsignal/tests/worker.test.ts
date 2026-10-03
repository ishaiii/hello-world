import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../src/worker/handler';
import { EngineSession } from '../src/worker/session';
import { JobError, WorkerClient, WorkerResetError, type WorkerLike } from '../src/worker/client';
import type { ResponseMessage } from '../src/worker/protocol';
import type { ProgressInfo } from '../src/engine/types';
import { DISPATCH_CSV, ORDERS_CSV, SAMPLE_EXPECTED as X, sampleOrdersConfig } from '../src/sample/orders';
import { enc } from './helpers';

/** Runs the real handler on the same thread, cloning messages the way a Worker does. */
class LocalWorker implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  session = new EngineSession();
  private handle = createHandler((msg: ResponseMessage) => {
    if (!this.terminated) setTimeout(() => this.onmessage?.({ data: structuredClone(msg) }), 0);
  }, this.session);
  postMessage(m: unknown) {
    if (this.terminated) return;
    const copy = structuredClone(m);
    setTimeout(() => this.handle(copy), 0);
  }
  terminate() {
    this.terminated = true;
  }
}

/** A worker that never answers cancel (like one stuck in a long synchronous call). */
class DeafWorker extends LocalWorker {
  override postMessage(m: unknown) {
    if (typeof m === 'object' && m !== null && 'cancel' in m) return;
    super.postMessage(m);
  }
}

const buf = (s: string) => enc(s).buffer.slice(0) as ArrayBuffer;

async function loadSample(client: WorkerClient) {
  await client.call('loadFile', { role: 'A', name: 'orders.csv', bytes: buf(ORDERS_CSV), options: {} }).promise;
  await client.call('loadFile', { role: 'B', name: 'dispatch.csv', bytes: buf(DISPATCH_CSV), options: {} }).promise;
}

describe('worker protocol', () => {
  it('loads both files, compares and reports real progress phases', async () => {
    const client = new WorkerClient(() => new LocalWorker());
    await loadSample(client);
    const phases: string[] = [];
    const res = await client.call('compare', { config: sampleOrdersConfig() }, { onProgress: (p: ProgressInfo) => phases.push(p.phase) }).promise;
    expect(res.summary).toMatchObject({ matched: X.matched, different: X.different, onlyA: X.onlyA, onlyB: X.onlyB, ambiguousGroups: 1 });
    expect(res.accounting.balanced).toBe(true);
    expect(new Set(phases)).toEqual(new Set(['validating', 'matching', 'preparing']));
    client.dispose();
  });

  it('serves row detail with original values, normalised values and the exact reason', async () => {
    const client = new WorkerClient(() => new LocalWorker());
    await loadSample(client);
    const res = await client.call('compare', { config: sampleOrdersConfig() }).promise;
    const row = res.rows.find((r) => r.keyA?.[0] === '1004')!;
    const d = await client.call('detail', { rowId: row.id }).promise;
    expect(d.category).toBe('different');
    expect(d.records.A[0]).toMatchObject({ rowNumber: 5 });
    expect(d.records.B[0]).toMatchObject({ rowNumber: 6 });
    const qty = d.fields.find((f) => f.label === 'Quantity')!;
    expect(qty).toMatchObject({ aRaw: '5', bRaw: '4', status: 'd' });
    expect(qty.reason).toBe('Quantity: A has 5, B has 4.');
    expect(d.fields.find((f) => f.label === 'Amount')!.status).toBe('s');
    expect(d.fields.find((f) => f.label === 'Date')!).toMatchObject({ aRaw: '03/04/2026', bRaw: '04/03/2026', aShown: '2026-04-03', bShown: '2026-04-03' });
    const group = res.rows.find((r) => r.category === 'ambiguous')!;
    const g = await client.call('detail', { rowId: group.id }).promise;
    expect(g.records.A).toHaveLength(2);
    expect(g.records.B).toHaveLength(1);
    client.dispose();
  });

  it('cancels a running job cooperatively and stays usable', async () => {
    const client = new WorkerClient(() => new LocalWorker());
    const rows = ['id,v'];
    for (let i = 0; i < 60000; i++) rows.push(`${i},${i}`);
    const big = buf(rows.join('\n'));
    await client.call('loadFile', { role: 'A', name: 'a.csv', bytes: big, options: {} }).promise;
    await client.call('loadFile', { role: 'B', name: 'b.csv', bytes: big, options: {} }).promise;
    const config = { ...sampleOrdersConfig(), keys: [{ id: 'k1', label: 'id', aColumn: 'c0', bColumn: 'c0', trim: false, caseInsensitive: false }], fields: [] };
    const job = client.call('compare', { config });
    setTimeout(() => job.cancel(), 5);
    await expect(job.promise).rejects.toMatchObject({ cancelled: true, code: 'cancelled' });
    expect(client.resetCount).toBe(0);
    const again = await client.call('compare', { config }).promise;
    expect(again.summary.matched).toBe(60000);
    client.dispose();
  }, 60000);

  it('hard-resets an unresponsive worker and replays the loaded files', async () => {
    const workers: LocalWorker[] = [];
    const client = new WorkerClient(() => {
      const w = workers.length === 0 ? new DeafWorker() : new LocalWorker();
      workers.push(w);
      return w;
    }, 30);
    const onReset = vi.fn();
    client.setOnReset(onReset);
    const rows = ['id,v'];
    for (let i = 0; i < 60000; i++) rows.push(`${i},${i}`);
    const big = buf(rows.join('\n'));
    await client.call('loadFile', { role: 'A', name: 'a.csv', bytes: big, options: {} }).promise;
    await client.call('loadFile', { role: 'B', name: 'b.csv', bytes: big, options: {} }).promise;
    const config = { ...sampleOrdersConfig(), keys: [{ id: 'k1', label: 'id', aColumn: 'c0', bColumn: 'c0', trim: false, caseInsensitive: false }], fields: [] };
    const job = client.call('compare', { config });
    setTimeout(() => job.cancel(), 5); // the first worker ignores this, so the client must terminate it
    await expect(job.promise).rejects.toBeInstanceOf(WorkerResetError);
    expect(client.resetCount).toBe(1);
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(true);
    expect(onReset).toHaveBeenCalledTimes(1);
    // the replacement worker was brought back to the same loaded state
    const res = await client.call('compare', { config }).promise;
    expect(res.summary.matched).toBe(60000);
    client.dispose();
  }, 60000);

  it('rejects pending jobs and recovers when the worker crashes', async () => {
    let first: LocalWorker | null = null;
    const client = new WorkerClient(() => {
      const w = new LocalWorker();
      first ??= w;
      return w;
    });
    await loadSample(client);
    const job = client.call('compare', { config: sampleOrdersConfig() });
    first!.onerror?.(new Error('boom'));
    await expect(job.promise).rejects.toBeInstanceOf(WorkerResetError);
    expect(client.resetCount).toBe(1);
    const res = await client.call('compare', { config: sampleOrdersConfig() }).promise;
    expect(res.summary.pairs).toBe(6);
    client.dispose();
  });

  it('ignores replies for jobs it no longer waits for (stale results)', async () => {
    const client = new WorkerClient(() => new LocalWorker());
    await loadSample(client);
    const slow = client.call('compare', { config: sampleOrdersConfig() });
    slow.cancel();
    const fast = client.call('hints', {});
    await expect(slow.promise).rejects.toMatchObject({ cancelled: true });
    const hints = await fast.promise;
    expect(hints.mapping.keys[0]).toMatchObject({ aColumn: 'c0' });
    client.dispose();
  });

  it('validates requests and never leaks file content through error text', async () => {
    const worker = new LocalWorker();
    const client = new WorkerClient(() => worker);
    await loadSample(client);
    const bad = client.call('compare', { config: { ...sampleOrdersConfig(), version: 2 } as never });
    await expect(bad.promise).rejects.toMatchObject({ code: 'bad-request' });
    vi.spyOn(worker.session, 'detail').mockImplementation(() => {
      throw new Error('secret cell value 4111-1111-1111-1111');
    });
    await client.call('compare', { config: sampleOrdersConfig() }).promise;
    const leak = client.call('detail', { rowId: 'x' });
    const err = await leak.promise.catch((e: JobError) => e);
    expect(err).toBeInstanceOf(JobError);
    expect((err as JobError).code).toBe('internal');
    expect((err as JobError).message).not.toMatch(/4111|secret/);
    client.dispose();
  });

  it('surfaces file problems as readable errors from the worker', async () => {
    const client = new WorkerClient(() => new LocalWorker());
    const job = client.call('loadFile', { role: 'A', name: 'report.pdf', bytes: buf('%PDF-1.4'), options: {} });
    await expect(job.promise).rejects.toMatchObject({ code: 'unsupported-type' });
    client.dispose();
  });

  it('exports through the worker and transfers real bytes', async () => {
    const client = new WorkerClient(() => new LocalWorker());
    await loadSample(client);
    await client.call('compare', { config: sampleOrdersConfig() }).promise;
    const out = await client.call('export', {
      options: { format: 'csv', scope: 'all', rowIds: null, fieldIds: null, includeNormalized: false, includeReasons: true, includeRowRefs: true, includeReview: false, includeRules: false, roleNames: { A: 'Orders', B: 'Dispatch' }, fileNames: { A: 'orders.csv', B: 'dispatch.csv' }, sheetNames: { A: null, B: null } },
      annotations: {},
    }).promise;
    expect(out.filename).toMatch(/^rowsignal-results-\d{8}-\d{4}\.csv$/);
    expect(new TextDecoder().decode(new Uint8Array(out.bytes))).toContain('Different');
    client.dispose();
  });

  it('applies and undoes manual links through the worker, keeping the accounting balanced', async () => {
    const client = new WorkerClient(() => new LocalWorker());
    await loadSample(client);
    const res = await client.call('compare', { config: sampleOrdersConfig() }).promise;
    const a = res.rows.find((r) => r.category === 'only-a')!; // 1007
    const b = res.rows.find((r) => r.category === 'only-b' && r.keyB?.[0] === '1009')!;
    const linked = await client.call('links', { links: [{ aIdx: a.aIdx[0]!, bIdx: b.bIdx[0]! }] }).promise;
    expect(linked.summary).toMatchObject({ manualPairs: 1, onlyA: 0, onlyB: 1 });
    expect(linked.accounting.A.pairedManual).toBe(1);
    expect(linked.accounting.balanced).toBe(true);
    const undone = await client.call('links', { links: [] }).promise;
    expect(undone.summary).toMatchObject({ manualPairs: 0, onlyA: 1, onlyB: 2 });
    client.dispose();
  });
});
