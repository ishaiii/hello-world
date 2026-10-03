/// <reference lib="webworker" />
import { createHandler } from './handler';
import type { ResponseMessage } from './protocol';

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

const scope = self as unknown as WorkerScope;
const handle = createHandler((msg: ResponseMessage, transfer?: Transferable[]) => scope.postMessage(msg, transfer ?? []));
scope.onmessage = (e: MessageEvent) => handle(e.data);
