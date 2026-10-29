import { useRef, useState } from 'react';
import { swipeDirection } from './swipeDirection.js';
export default function useSwipe({ onLeft, onRight, disabled }) {
  const start = useRef(null);
  const [drag, setDrag] = useState(null);
  function reset() { start.current = null; setDrag(null); }
  return { drag, gestures: {
    onPointerDown(event) {
      if (disabled || event.button !== 0 || event.isPrimary === false || event.target.closest('button,a,input,textarea,select,label')) return;
      if (event.pointerType === 'mouse') event.preventDefault();
      start.current = { id:event.pointerId, x:event.clientX, y:event.clientY };
      setDrag({ x: 0, direction: null });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      const origin = start.current;
      if (!origin || disabled || origin.id !== event.pointerId) return;
      const end = { x:event.clientX, y:event.clientY };
      setDrag({ x: Math.max(-160, Math.min(160, end.x - origin.x)), direction: swipeDirection(origin, end) });
    },
    onPointerUp(event) {
      const origin = start.current; reset();
      if (!origin || disabled || origin.id !== event.pointerId) return;
      const direction = swipeDirection(origin, {x:event.clientX,y:event.clientY});
      if (direction === 'left') onLeft();
      if (direction === 'right') onRight();
    },
    onPointerCancel: reset,
    onLostPointerCapture: reset,
    onKeyDown(event) {
      if (disabled || event.target !== event.currentTarget) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); onLeft(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); onRight(); }
    },
  } };
}
