// Pointer capture keeps release working even when a finger or mouse leaves the button.
// No DOM globals are required, so cancellation and keyboard behavior can be tested directly.
export function bindHoldToView(element, begin, end) {
  let active = null;
  const release = () => {
    if (active === null) return;
    const previous = active; active = null;
    element.setAttribute('aria-pressed', 'false');
    end();
    if (typeof previous === 'number' && element.hasPointerCapture?.(previous)) element.releasePointerCapture(previous);
  };
  element.setAttribute('aria-pressed', 'false');
  element.addEventListener('pointerdown', e => {
    if (element.disabled || active !== null || e.isPrimary === false || e.button !== 0) return;
    e.preventDefault();
    if (begin() === false) return;
    active = e.pointerId; element.setPointerCapture?.(e.pointerId);
    element.setAttribute('aria-pressed', 'true');
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, e => { if (active === e.pointerId) release(); });
  element.addEventListener('keydown', e => {
    if (![' ', 'Enter'].includes(e.key)) return;
    e.preventDefault();
    if (element.disabled || active !== null || e.repeat) return;
    if (begin() === false) return;
    active = e.key; element.setAttribute('aria-pressed', 'true');
  });
  element.addEventListener('keyup', e => { if (active === e.key) { e.preventDefault(); release(); } });
  element.addEventListener('blur', release);
  element.addEventListener('click', e => e.preventDefault());
  element.addEventListener('contextmenu', e => e.preventDefault());
  return release;
}
