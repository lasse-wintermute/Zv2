// Corner minimap for the world map (SOTD pattern), drawn in the SAME isometric
// perspective as the main view: the 50×50 city renders as a diamond, fog/terrain
// per tile, home + squads as markers, plus the camera's view polygon (which
// tilts as you rotate the view). Click or drag to jump; wheel zooms the world.
import { TW, TH, WORLD_SCALE as WS, isoXY } from './config.js';

const TERRAIN = {
  urban: '#6b6353', park: '#33502f', forest: '#2a4229',
  water: '#1d3d46', bridge: '#4a5350',
};

export function createMinimap(canvas, opts = {}) {
  const onMove = opts.onMove || (() => {});      // (camX, camY) => rerender
  const onZoom = opts.onZoom || (() => {});      // (deltaSteps) => adjust world zoom
  const ctx = canvas.getContext('2d');
  const PAD = 4;
  let last = null;                                // {map, cam}
  let scrubbing = false;

  // Iso mini-projection: tile (x,y) -> minimap px. Same 2:1 diamond as the world.
  function proj(map) {
    const w = map.world.w, h = map.world.h;
    const s = (canvas.width - PAD * 2) / (w + h);        // horizontal half-step
    const cx = PAD + h * s;                               // x of tile (1,1)
    const cy = PAD + 2;
    return {
      s,
      toPx: (x, y) => [cx + (x - y) * s, cy + (x + y - 2) * s / 2],
      toTile: (px, py) => {
        const a = (px - cx) / s, b = (py - cy) * 2 / s + 2;
        return [(a + b) / 2, (b - a) / 2];
      },
    };
  }

  // pre-transform world point -> tile coords, honoring the camera rotation
  function screenToTile(map, cam, px, py) {
    const W = window.innerWidth, H = window.innerHeight, z = cam.worldZoom;
    const cos = Math.cos(cam.rot || 0), sin = Math.sin(cam.rot || 0);
    const dx = px - W / 2, dy = py - H / 2;
    const ux = (dx * cos + dy * sin) / z, uy = (-dx * sin + dy * cos) / z;
    const oxWS = ux - cam.x / z, oyWS = uy + 20 - cam.y / z;
    const ox = oxWS / WS, oy = oyWS / WS;
    const c = (ox / (TW / 2) + oy / (TH / 2)) / 2, r = (oy / (TH / 2) - ox / (TW / 2)) / 2;
    return [c + (map.world.w + 1) / 2, r + (map.world.h + 1) / 2];
  }
  function camFor(map, cam, x, y) {
    const [ox, oy] = isoXY(y - (map.world.h + 1) / 2, x - (map.world.w + 1) / 2);
    return [-ox * WS * cam.worldZoom, (20 - oy * WS) * cam.worldZoom];
  }

  function render(map, cam) {
    if (!map?.tiles) return;
    last = { map, cam };
    const { s, toPx } = proj(map);
    const dw = Math.max(2, s * 1.9), dh = Math.max(1.4, s);   // tile diamond bounding box
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(10,14,12,.96)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const t of map.tiles) {
      const [px, py] = toPx(t.x, t.y);
      if (!t.seen) {
        ctx.fillStyle = t.scoutable ? '#3c3823' : (t.terrain === 'water' ? '#14262b' : '#1a221f');
      } else {
        ctx.fillStyle = t.home ? '#ffd15a' : (TERRAIN[t.terrain] || TERRAIN.urban);
      }
      ctx.fillRect(px - dw / 2, py - dh / 2, dw, dh);
    }
    for (const squad of (map.squads || (map.squad ? [map.squad] : []))) {
      const [px, py] = toPx(squad.x, squad.y);
      ctx.fillStyle = squad.id === map.squad?.id ? '#ffe07b' : '#83b4bf';
      ctx.fillRect(px - dw / 2 - 1, py - dh / 2 - 1, dw + 2, dh + 2);
    }
    // camera view polygon — rotates with the main view
    const W = window.innerWidth, H = window.innerHeight;
    const corners = [[0, 0], [W, 0], [W, H], [0, H]].map(([px, py]) => {
      const [tx, ty] = screenToTile(map, cam, px, py);
      return toPx(tx, ty);
    });
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); corners.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.stroke();
  }

  function jumpTo(clientX, clientY) {
    if (!last) return;
    const rect = canvas.getBoundingClientRect();
    const { toTile } = proj(last.map);
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    let [tx, ty] = toTile(x, y);
    tx = Math.max(1, Math.min(last.map.world.w, tx));
    ty = Math.max(1, Math.min(last.map.world.h, ty));
    const [cx, cy] = camFor(last.map, last.cam, tx, ty);
    onMove(cx, cy);
  }

  canvas.addEventListener('pointerdown', (e) => { scrubbing = true; canvas.setPointerCapture?.(e.pointerId); jumpTo(e.clientX, e.clientY); e.stopPropagation(); });
  canvas.addEventListener('pointermove', (e) => { if (scrubbing) jumpTo(e.clientX, e.clientY); });
  const stop = () => { scrubbing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); onZoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });

  return { render };
}
