/**
 * The worker's request handler, separated from the Worker globals so tests (and a same-thread
 * fallback) can run it. Requests run one at a time in arrival order; a cancel message takes effect
 * immediately because jobs yield to the event loop between chunks of work.
 */
import { z } from 'zod';
import { CancelledError, UserFacingError, type JobHooks } from '../engine/types';
import { payloadSchemas, type ExportResponse, type Op, type Payloads, type ResponseMessage, type Results } from './protocol';
import { EngineSession } from './session';

type Post = (msg: ResponseMessage, transfer?: Transferable[]) => void;

type Handlers = { [K in Op]: (p: Payloads[K], hooks: JobHooks) => Results[K] | Promise<Results[K]> };

function handlersFor(session: EngineSession): Handlers {
  return {
    loadFile: (p, hooks) => {
      hooks.onProgress?.({ phase: 'reading' });
      return session.loadFile(p.role, p.name, new Uint8Array(p.bytes), p.options);
    },
    reparse: (p, hooks) => {
      hooks.onProgress?.({ phase: 'reading' });
      return session.reparse(p.role, p.options);
    },
    removeFile: (p) => {
      session.removeFile(p.role);
      return null;
    },
    hints: () => session.hints(),
    analyze: (p, hooks) => session.analyze(p.config, hooks),
    compare: (p, hooks) => session.compare(p.config, hooks),
    suggest: (p, hooks) => session.suggest(p.approx, hooks),
    links: (p) => session.setLinks(p.links),
    detail: (p) => session.detail(p.rowId),
    export: (p, hooks) => {
      hooks.onProgress?.({ phase: 'exporting' });
      const built = session.exportResult(p.options, p.annotations);
      const bytes = built.bytes.buffer.slice(built.bytes.byteOffset, built.bytes.byteOffset + built.bytes.byteLength) as ArrayBuffer;
      const res: ExportResponse = { bytes, filename: built.filename, mime: built.mime, resultRows: built.resultRows, notes: built.notes };
      return res;
    },
  };
}

export function createHandler(post: Post, session: EngineSession = new EngineSession()) {
  const handlers = handlersFor(session);
  const cancelled = new Set<number>();
  let chain: Promise<void> = Promise.resolve();

  const run = async (id: number, op: Op, raw: unknown): Promise<void> => {
    if (cancelled.has(id)) {
      cancelled.delete(id);
      post({ id, kind: 'error', code: 'cancelled', message: 'Cancelled', cancelled: true });
      return;
    }
    const hooks: JobHooks = {
      isCancelled: () => cancelled.has(id),
      onProgress: (progress) => post({ id, kind: 'progress', progress }),
    };
    try {
      const payload = payloadSchemas[op].parse(raw);
      const data = await (handlers[op] as (p: unknown, h: JobHooks) => unknown)(payload, hooks);
      if (cancelled.has(id)) throw new CancelledError();
      post({ id, kind: 'ok', data }, op === 'export' ? [(data as ExportResponse).bytes] : undefined);
    } catch (e) {
      // Messages are written to be safe to show; unexpected errors are reduced to a generic line
      // so that no file content can leak through an exception message.
      if (e instanceof CancelledError) post({ id, kind: 'error', code: 'cancelled', message: 'Cancelled', cancelled: true });
      else if (e instanceof UserFacingError) post({ id, kind: 'error', code: e.code, message: e.message, cancelled: false });
      else if (e instanceof z.ZodError) post({ id, kind: 'error', code: 'bad-request', message: 'The request was not valid.', cancelled: false });
      else post({ id, kind: 'error', code: 'internal', message: 'Something went wrong while processing the file. Try again, or download diagnostics from the Help menu.', cancelled: false });
    } finally {
      cancelled.delete(id);
    }
  };

  return (data: unknown): void => {
    if (typeof data !== 'object' || data === null) return;
    const m = data as { cancel?: unknown; id?: unknown; op?: unknown; payload?: unknown };
    if (typeof m.cancel === 'number') {
      cancelled.add(m.cancel);
      return;
    }
    if (typeof m.id !== 'number' || typeof m.op !== 'string' || !(m.op in payloadSchemas)) return;
    const { id, op, payload } = m as { id: number; op: Op; payload: unknown };
    chain = chain.then(() => run(id, op, payload));
  };
}
