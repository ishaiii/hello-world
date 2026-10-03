import type { ExampleRun } from '../sample/runExample';

export interface PageProps {
  runs: Record<string, ExampleRun>;
}
