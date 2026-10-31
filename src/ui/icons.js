const FACE_TOP = 'matrix(45 -26 45 26 15 34)';
const FACE_LEFT = 'matrix(45 26 0 52 15 34)';
const FACE_RIGHT = 'matrix(45 -26 0 52 60 60)';
const pip = (x, y) => `<circle cx="${x}" cy="${y}" r=".095"/>`;

export const ICONS = {
  dice: `<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <path d="M60 8 105 34v52l-45 26-45-26V34z" fill="#fff" stroke="#2f4644" stroke-width="6" stroke-linejoin="round"/>
  <path d="M15 34l45 26 45-26M60 60v52" fill="none" stroke="#2f4644" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="#2f4644">
    <g transform="${FACE_TOP}">${pip(.5, .5)}</g>
    <g transform="${FACE_LEFT}">${pip(.27, .27)}${pip(.73, .73)}</g>
    <g transform="${FACE_RIGHT}">${pip(.25, .25)}${pip(.5, .5)}${pip(.75, .75)}</g>
  </g>
</svg>`
};