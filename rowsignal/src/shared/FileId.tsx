import type { Role } from '../engine/types';

/** "File A" / "File B": file identity is always spelled out, never carried by colour alone. */
export function FileId({ role }: { role: Role }) {
  return <span className={`fileid ${role === 'B' ? 'fileid--b' : ''}`}>File {role}</span>;
}
