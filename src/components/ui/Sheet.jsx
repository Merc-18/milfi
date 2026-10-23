import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Accessible modal sheet on the native <dialog>: showModal() makes the rest of
// the page inert, Tab cycles inside, Esc and the close button close it, and
// focus returns to the control that opened it. No entrance animation.
export default function Sheet({ open, onClose, title, children }) {
  const dialog = useRef(null);
  const opener = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      opener.current = document.activeElement;
      node.showModal();
    } else if (!open && node.open) {
      node.close();
      opener.current?.focus?.();
    }
  }, [open]);
  // React state is the source of truth: every way out asks the parent to close.
  // The native close event is queued, so it may arrive after a quick reopen;
  // it only counts when the dialog is really closed.
  const cancel = event => { event.preventDefault(); onClose(); };
  const trap = event => {
    if (event.key !== 'Tab') return;
    const items = [...dialog.current.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const [first, last] = [items[0], items[items.length - 1]];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={cancel} onKeyDown={trap}
    onClose={() => { if (open && !dialog.current.open) onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}
    className="mt-auto mb-0 w-full max-w-full max-h-[90dvh] rounded-t-[28px] bg-fondo p-0 text-texto shadow-soft backdrop:bg-texto/40 sm:m-auto sm:max-w-lg sm:rounded-[24px]">
    {open && <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="min-h-11 min-w-11 rounded-xl bg-white shadow-soft flex items-center justify-center hover:bg-principal/60">
          <X size={20} aria-hidden="true" /></button>
      </div>
      {children}
    </div>}
  </dialog>;
}
