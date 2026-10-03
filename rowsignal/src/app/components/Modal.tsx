import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
  /** Accessible description id, if the body has an introductory paragraph. */
  describedBy?: string;
}

/**
 * A modal built on the native <dialog> element: focus is trapped inside, the page behind is inert,
 * Escape closes it, and focus returns to the control that opened it.
 */
export function Modal({ open, onClose, title, children, footer, wide, className = '', describedBy }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog--wide' : ''} ${className}`}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop reports the dialog itself as the target.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="dialog__head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label={`Close ${title}`}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="dialog__body">{children}</div>
          {footer && <div className="dialog__foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
