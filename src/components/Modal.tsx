import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restore = useRef({ y: window.scrollY, trigger: document.activeElement as HTMLElement | null });
  const frame = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    const { y, trigger } = restore.current;
    const body = document.body;
    const before = { position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = 'fixed'; body.style.top = `-${y}px`; body.style.width = '100%';
    dialog.current?.showModal();
    return () => {
      Object.assign(body.style, before);
      window.scrollTo(0, y);
      frame.current = requestAnimationFrame(() => { window.scrollTo(0, y); trigger?.focus({ preventScroll: true }); });
    };
  }, []);
  return <dialog ref={dialog} className="modal" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close.current(); }}>
    <div className="modal-header"><h2>{title}</h2><button type="button" className="icon-button" aria-label="關閉" disabled={busy} onClick={onClose}><X size={21}/></button></div>
    <div className="modal-content">{children}</div>
  </dialog>;
}
