import { useRef } from 'react';
import { swipeDirection } from './swipeDirection.js';
export default function useSwipe({ onLeft, onRight, disabled }) {
  const start = useRef(null);
  return {
    onPointerDown(event) {
      if (disabled || event.button !== 0 || event.isPrimary === false || event.target.closest('button,a,input,textarea,select,label')) return;
      if (event.pointerType === 'mouse') event.preventDefault(); // Avoid native text dragging canceling a swipe.
      start.current = { id:event.pointerId, x:event.clientX, y:event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerUp(event) {
      const origin = start.current; start.current = null;
      if (!origin || disabled || origin.id !== event.pointerId) return;
      const direction = swipeDirection(origin, {x:event.clientX,y:event.clientY});
      if (direction === 'left') onLeft();
      if (direction === 'right') onRight();
    },
    onPointerCancel() { start.current = null; },
    onLostPointerCapture() { start.current = null; },
    onKeyDown(event) {
      if (disabled || event.target !== event.currentTarget) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); onLeft(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); onRight(); }
    },
  };
}
