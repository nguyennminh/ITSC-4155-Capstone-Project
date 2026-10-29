export function swipeDirection(start, end, threshold = 70) {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.4) return null;
  return dx > 0 ? 'right' : 'left';
}
