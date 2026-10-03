import { hydrateRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/public.css';
import { ISLANDS, type IslandName } from './islands';

/**
 * The public pages are plain server-rendered HTML. Only elements marked `data-island` are made
 * interactive here; nothing on these pages reads files.
 */
for (const el of document.querySelectorAll<HTMLElement>('[data-island]')) {
  const name = el.dataset.island as IslandName;
  const Island = ISLANDS[name];
  if (Island) hydrateRoot(el, <Island />);
}
