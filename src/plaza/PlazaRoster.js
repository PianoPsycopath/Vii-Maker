import { PLAZA_CONFIG, PlazaMath } from './PlazaConfig.js';

const SPAWN_ATTEMPTS = 40;
const MIN_SPACING = 1.3;
const FALLBACK_SCALE = 0.7;
const MIN_FROM_CENTER = 1.8;

function calculateSpawnSpot(takenSpots) {
  const { RADIUS } = PLAZA_CONFIG;

  for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
    const angle = PlazaMath.getRandomFloat(0, Math.PI * 2);
    const radius = Math.sqrt(Math.random()) * RADIUS;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (takenSpots.every(([spotX, spotZ]) => Math.hypot(spotX - x, spotZ - z) > MIN_SPACING)) {
      return [x, z];
    }
  }
  return [
    PlazaMath.getRandomFloat(-RADIUS, RADIUS) * FALLBACK_SCALE,
    PlazaMath.getRandomFloat(-RADIUS, RADIUS) * FALLBACK_SCALE
  ];
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = PlazaMath.getRandomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function buildFreshEntries({ names, count, featuredName }) {
  const pool = shuffle(names.slice());

  if (featuredName) {
    const at = pool.indexOf(featuredName);
    if (at > 0) {
      pool.splice(at, 1);
      pool.unshift(featuredName);
    }
  }

  const takenSpots = [];
  return pool.slice(0, Math.min(count, pool.length)).map((name) => {
    const spot = calculateSpawnSpot(takenSpots);
    takenSpots.push(spot);
    return { name, x: spot[0], z: spot[1] };
  });
}

export function buildRestoreEntries(restore, lookup) {
  const { roster = [], featured = null } = restore;
  const entries = [];
  const seen = new Set(featured ? [featured.name] : []);

  for (const item of roster) {
    if (seen.has(item.name) || !lookup(item.name)) continue;
    seen.add(item.name);

    let { x, z } = item;
    if (featured && Math.hypot(x, z) < MIN_FROM_CENTER) {
      const angle = Math.hypot(x, z) > 0.01 ? Math.atan2(z, x) : PlazaMath.getRandomFloat(0, Math.PI * 2);
      x = Math.cos(angle) * MIN_FROM_CENTER;
      z = Math.sin(angle) * MIN_FROM_CENTER;
    }
    entries.push({ name: item.name, x, z, yaw: item.yaw, options: { previewConfig: item.previewConfig } });
  }

  if (featured) {
    entries.push({
      name: featured.name,
      x: 0,
      z: 0,
      yaw: 0,
      hero: true,
      options: { previewConfig: featured.previewConfig, simShift: featured.simShift }
    });
  }
  return entries;
}