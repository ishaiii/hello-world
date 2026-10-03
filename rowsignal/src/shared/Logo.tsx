import { site } from '../site.config';

/** Original mark: two aligned columns of rows; the highlighted pair is the "signal". */
export function LogoMark({ className = 'brand__mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#2457d6" />
      <g fill="#fff">
        <rect x="5.5" y="8" width="8.5" height="3" rx="1.5" />
        <rect x="5.5" y="14.5" width="8.5" height="3" rx="1.5" />
        <rect x="5.5" y="21" width="8.5" height="3" rx="1.5" />
        <rect x="18" y="8" width="8.5" height="3" rx="1.5" opacity="0.92" />
        <rect x="18" y="21" width="8.5" height="3" rx="1.5" opacity="0.92" />
      </g>
      <rect x="18" y="14.5" width="8.5" height="3" rx="1.5" fill="#7fe3d8" />
      <path d="M15.6 12.5v7" stroke="#7fe3d8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <a className="brand" href={href} aria-label={`${site.name} home`}>
      <LogoMark />
      <span>
        Row<span className="brand__signal">Signal</span>
      </span>
    </a>
  );
}
