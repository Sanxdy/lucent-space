import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../useFocusTrap";
import { IconX } from "./Icons";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function Modal({ title, onClose, children, footer, wide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);

  return createPortal(
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="modal glass glass-thick"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        style={wide ? { width: "min(680px, 100%)" } : undefined}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn-icon sm" onClick={onClose} aria-label="Close">
            <IconX size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
