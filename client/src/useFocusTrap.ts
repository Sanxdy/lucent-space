import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/* Overlays stack: only the last opened one answers Escape and wraps Tab. */
const layers: symbol[] = [];

function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true" && (element.offsetWidth > 0 || element.offsetHeight > 0),
  );
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const layer = Symbol("overlay");
    layers.push(layer);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const field = root.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
    (field ?? focusables(root)[0] ?? root).focus();

    const onKey = (event: KeyboardEvent) => {
      if (layers[layers.length - 1] !== layer) return;
      if (event.key === "Escape") {
        if (escape.current) {
          event.stopPropagation();
          escape.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const outside = !root.contains(current);
      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      previous?.focus();
    };
  }, [ref, active]);
}
