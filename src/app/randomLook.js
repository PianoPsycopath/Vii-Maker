import {
  eyeIndex, hairIndex, EYE_STYLES, HAIR_STYLES, NOSE_STYLES, SKIN_TONES,
  COLOR_COUNT, EYE_COLORS, HAIR_COLOR_COUNT
} from '../data.js';

const BALD_CHANCE = 0.05;
const GENDER_HAIR_CHANCE = 0.5;

const randomInt = max => 1 + Math.floor(Math.random() * max);
const randomItem = items => items[randomInt(items.length) - 1];

export function rollRandomLook(gender) {
  const genderHair = gender === 'f' ? 'alex' : 'ari';
  const hairStyleName = Math.random() < BALD_CHANCE
    ? 'bald'
    : Math.random() < GENDER_HAIR_CHANCE
      ? genderHair
      : randomItem(HAIR_STYLES);

  return {
    e: eyeIndex(randomItem(EYE_STYLES), randomInt(EYE_COLORS)),
    o: randomInt(COLOR_COUNT),
    t: randomInt(COLOR_COUNT),
    n: randomInt(NOSE_STYLES.length) - 1,
    sk: randomInt(SKIN_TONES.length) - 1,
    h: hairIndex(hairStyleName, randomInt(HAIR_COLOR_COUNT))
  };
}