// Facility sprite registry. Keyed by the `key` field in config.js -- never by
// display name, which the German toggle rewrites.
//
// Loading is fire-and-forget: the renderer falls back to the procedural
// facilityModel() until an image has actually decoded, so a slow or missing
// sprite degrades to the old look instead of a hole in the compound.

import manifest from './assets/facilities/manifest.json';

const urls = import.meta.glob('./assets/facilities/*.webp', {
  eager: true, query: '?url', import: 'default',
});

const STORAGE_KEY = 'zv2.sprites';
const images = {};
const readyCallbacks = new Set();

for (const [path, url] of Object.entries(urls)) {
  const key = path.slice(path.lastIndexOf('/') + 1).replace(/\.webp$/, '');
  const img = new Image();
  img.decoding = 'async';
  img.addEventListener('load', () => readyCallbacks.forEach((cb) => cb()));
  img.src = url;
  images[key] = img;
}

let enabled = localStorage.getItem(STORAGE_KEY) !== 'off';

export const spritesEnabled = () => enabled;

export function setSpritesEnabled(next) {
  enabled = !!next;
  localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  readyCallbacks.forEach((cb) => cb());
}

/** Decoded sprite for a facility key, or null while loading / when disabled. */
export function getSprite(key) {
  if (!enabled) return null;
  const img = images[key];
  return img && img.complete && img.naturalWidth ? img : null;
}

/**
 * Height fraction at which a sprite meets the ground, so the renderer can sit the
 * building on its tile rather than on its bounding box. 1 for most; lower where the
 * artwork parks a detached prop underneath (sandbags below the barracks), which
 * would otherwise push the building itself up into the air.
 */
export const getAnchor = (key) => manifest[key]?.anchor ?? 1;

/** Draw size relative to one tile. >1 for buildings meant to dominate the compound. */
export const getScale = (key) => manifest[key]?.scale ?? 1;

/** Re-render hook: fires as each sprite decodes and when the toggle flips. */
export function onSpritesChanged(cb) {
  readyCallbacks.add(cb);
  return () => readyCallbacks.delete(cb);
}

export const spriteCount = Object.keys(images).length;
