import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal-based modal wrapper. Renders children at document.body so the modal
 * cannot be trapped by an ancestor's stacking context, transform, or overflow.
 * Used for all admin/tenant popup forms so the backdrop (bg-black/80 +
 * backdrop-blur) reliably covers the mobile header AND the bottom tab bar
 * on iPhone PWA — only the popup itself stays sharp.
 *
 * Children are rendered EXACTLY as passed; this component does not impose any
 * styling so existing modal markup stays untouched.
 */
export default function Modal({ children, open = true }) {
  useEffect(() => {
    if (!open) return undefined;
    // Lock body scroll while modal is open (helpful on iOS PWA).
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return createPortal(children, document.body);
}
