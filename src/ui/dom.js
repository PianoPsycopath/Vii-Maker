import { ELEMENT_SELECTORS, OPTIONAL_ELEMENTS } from './constants.js';

export function queryElements() {
  const elements = { body: document.body };
  const missing = [];

  for (const [key, selector] of Object.entries(ELEMENT_SELECTORS)) {
    const element = document.querySelector(selector);
    elements[key] = element;
    if (!element && !OPTIONAL_ELEMENTS.has(key)) missing.push(selector);
  }

  if (missing.length) {
    throw new Error(`UIController: missing required DOM elements: ${missing.join(', ')}`);
  }

  elements.carrySlots = Object.fromEntries(
    [...document.querySelectorAll('[data-carry]')].map(slot => [slot.dataset.carry, slot])
  );
  return elements;
}