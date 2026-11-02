export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const afterFrames = (count = 2) => new Promise(resolve => {
  const step = remaining => (remaining <= 1
    ? requestAnimationFrame(resolve)
    : requestAnimationFrame(() => step(remaining - 1)));
  step(count);
});