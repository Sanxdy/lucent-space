import { useStore } from "../store";
import { IconAlert, IconCheck } from "./Icons";

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast glass glass-thick ${toast.tone}`}
          onClick={() => dismissToast(toast.id)}
        >
          {toast.tone === "error" ? <IconAlert size={15} /> : <IconCheck size={15} />}
          {toast.text}
        </button>
      ))}
    </div>
  );
}
