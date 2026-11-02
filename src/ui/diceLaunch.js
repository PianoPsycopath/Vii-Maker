const RATTLE_MS = 480;
const SETTLE_MS = 380;
const LAUNCH_Z_INDEX = 95;

const RATTLE_KEYFRAMES = [
  { transform: 'rotate(0deg) scale(1)' },
  { transform: 'rotate(-9deg) scale(1.08)' },
  { transform: 'rotate(8deg) scale(1.08)' },
  { transform: 'rotate(-6deg) scale(1.04)' },
  { transform: 'rotate(4deg) scale(1.02)' },
  { transform: 'rotate(0deg) scale(1)' }
];

const SETTLE_KEYFRAMES = [
  { transform: 'scale(.6)' },
  { transform: 'scale(1.12)' },
  { transform: 'scale(1)' }
];

export function beginDiceLaunch(randomBtn) {
  const icon = randomBtn.querySelector('.big-ico');
  const rect = icon.getBoundingClientRect();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const copy = icon.cloneNode(true);
  copy.classList.add('dice-launch');
  Object.assign(copy.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: LAUNCH_Z_INDEX,
    margin: '0',
    pointerEvents: 'none',
    filter: 'none'
  });
  document.body.append(copy);
  icon.style.visibility = 'hidden';

  const rattle = copy.animate(RATTLE_KEYFRAMES, {
    duration: reduceMotion ? 1 : RATTLE_MS,
    easing: 'ease-in-out'
  });

  return {
    screen: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width },
    rattled: rattle.finished.then(() => undefined),
    release: () => copy.remove(),
    restore: () => {
      copy.remove();
      icon.style.visibility = '';
      icon.animate(SETTLE_KEYFRAMES, {
        duration: reduceMotion ? 1 : SETTLE_MS,
        easing: 'ease-out'
      });
    }
  };
}