import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

/* Segmented control with the reference's sliding lens: the pill springs from
   the old option to the new one and overshoots slightly before settling.
   The lens is positioned imperatively so measuring never re-renders. */
export function Seg({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  const measure = () => {
    const track = ref.current;
    const pill = pillRef.current;
    if (!track || !pill) return;
    const active = track.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active) {
      pill.style.opacity = "0";
      return;
    }
    pill.style.opacity = "1";
    pill.style.transform = `translateX(${active.offsetLeft - 3}px)`;
    pill.style.width = `${active.offsetWidth}px`;
  };

  useLayoutEffect(measure);

  useEffect(() => {
    const track = ref.current;
    if (!track) return;
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`seg ${className}`} ref={ref}>
      <span className="seg-pill" aria-hidden ref={pillRef} style={{ opacity: 0 }} />
      {children}
    </div>
  );
}
