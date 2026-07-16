// Isometric renderer: draws the stronghold as a living compound (SOTD feel).
// Read-only for now — facilities laid out on an iso grid, extruded by level,
// coloured by category, dark when unpowered.
import { TW, TH, isoXY, facInfo, facColor, fmtDuration, cityColor } from './config.js';

const INSET = 0.82;                 // building footprint vs tile
const hOf = (level) => 16 + level * 9;

function shade(hex, f) {
  let r, g, b;
  if (hex.startsWith('#')) {
    const n = parseInt(hex.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const m = hex.match(/[\d.]+/g) || [100, 100, 100]; [r, g, b] = m.map(Number);
  }
  r = Math.min(255, Math.round(r * f)); g = Math.min(255, Math.round(g * f)); b = Math.min(255, Math.round(b * f));
  return `rgb(${r},${g},${b})`;
}
const GREY = '#545a57';
const shortName = (s) => (s.length > 16 ? s.slice(0, 15) + '…' : s);
const hash = (n) => { const x = Math.sin(n * 91.17) * 43758.5453; return x - Math.floor(x); };

export function createView(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0, zoom: 1 };
  let W = 0, H = 0;
  let placements = [];        // [{slot,type,sx,sy,level}] captured each render, for hit-testing
  let emptyPlacements = [];
  let selected = null;        // selected slot (highlighted)

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth || canvas.clientWidth || 960;
    H = window.innerHeight || canvas.clientHeight || 600;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Server-owned persistent compound plots.
  function layout(facilities) {
    return facilities.map((f) => ({ ...f, r: f.gridY ?? 3, c: f.gridX ?? 3 }));
  }

  function sky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#11191a');
    g.addColorStop(0.42, '#29332f');
    g.addColorStop(0.72, '#685843');
    g.addColorStop(1, '#9b7548');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(W * .78, H * .18, 2, W * .78, H * .18, 72);
    sun.addColorStop(0, 'rgba(218,225,137,.7)'); sun.addColorStop(.35, 'rgba(180,190,100,.2)'); sun.addColorStop(1, 'rgba(80,100,65,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H * .55);
    ctx.fillStyle = 'rgba(12,18,18,.44)';
    for (let i = 0; i < Math.ceil(W / 55) + 2; i++) {
      const x = i * 55 - 20, bh = 18 + hash(i + 8) * 55;
      ctx.fillRect(x, H * .52 - bh, 42 + hash(i) * 26, bh);
      if (i % 3 === 0) { ctx.beginPath(); ctx.moveTo(x + 8, H * .52 - bh); ctx.lineTo(x + 26, H * .52 - bh - 14); ctx.lineTo(x + 42, H * .52 - bh); ctx.fill(); }
    }
    const haze = ctx.createLinearGradient(0, H * .37, 0, H);
    haze.addColorStop(0, 'rgba(91,112,72,0)'); haze.addColorStop(.5, 'rgba(92,105,65,.12)'); haze.addColorStop(1, 'rgba(23,30,25,.28)');
    ctx.fillStyle = haze; ctx.fillRect(0, 0, W, H);
  }

  function tilePlate(sx, sy, powered, empty=false) {
    ctx.beginPath();
    ctx.moveTo(sx, sy - TH / 2);
    ctx.lineTo(sx + TW / 2, sy);
    ctx.lineTo(sx, sy + TH / 2);
    ctx.lineTo(sx - TW / 2, sy);
    ctx.closePath();
    ctx.fillStyle = empty ? '#555747' : (powered ? '#756b51' : '#4c5045');
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,35,28,.42)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx - 24, sy + 5); ctx.lineTo(sx - 9, sy); ctx.lineTo(sx - 2, sy + 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(205,170,65,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx + 18, sy + 8); ctx.lineTo(sx + 28, sy + 3); ctx.stroke();
    if(empty){ctx.strokeStyle='rgba(198,184,118,.2)';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(sx,sy-TH/2+5);ctx.lineTo(sx+TW/2-10,sy);ctx.lineTo(sx,sy+TH/2-5);ctx.lineTo(sx-TW/2+10,sy);ctx.closePath();ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(220,207,145,.28)';ctx.font='16px system-ui';ctx.textAlign='center';ctx.fillText('+',sx,sy+5);}
  }

  function compoundPerimeter(points) {
    if (!points.length) return;
    const xs=points.map(p=>p.sx),ys=points.map(p=>p.sy),cx=(Math.min(...xs)+Math.max(...xs))/2;
    const cy=(Math.min(...ys)+Math.max(...ys))/2;
    const ring=[[cx,Math.min(...ys)-TH*.72],[Math.max(...xs)+TW*.72,cy],[cx,Math.max(...ys)+TH*.72],[Math.min(...xs)-TW*.72,cy]];
    ctx.strokeStyle='#474a3d';ctx.lineWidth=7;ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
    ctx.strokeStyle='#8c8060';ctx.lineWidth=2;ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
    ctx.fillStyle='#323a34';for(let e=0;e<4;e++){const a=ring[e],b=ring[(e+1)%4];for(let i=0;i<=6;i++){const t=i/6,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;ctx.fillRect(x-2,y-9,4,10);}}
    // fortified gate on the front edge
    ctx.fillStyle='#2c332f';ctx.fillRect(cx-16,ring[2][1]-12,32,13);ctx.strokeStyle='#b99d47';ctx.lineWidth=2;ctx.strokeRect(cx-16,ring[2][1]-12,32,13);
  }

  function survivalDetails(sx, sy, f, hw, hh, h) {
    const info = facInfo(f.type), roofY = sy - h;
    ctx.strokeStyle = 'rgba(19,24,21,.9)'; ctx.fillStyle = '#343c36'; ctx.lineWidth = 2;
    if (info.cat === 'power' || info.cat === 'prod') {
      ctx.fillRect(sx - 12, roofY - hh - 9, 9, 10); ctx.strokeRect(sx - 12, roofY - hh - 9, 9, 10);
      ctx.beginPath(); ctx.moveTo(sx - 7, roofY - hh - 9); ctx.bezierCurveTo(sx - 14, roofY - hh - 18, sx + 2, roofY - hh - 20, sx - 3, roofY - hh - 28); ctx.stroke();
    } else if (info.cat === 'mil') {
      ctx.beginPath(); ctx.moveTo(sx, roofY - hh - 2); ctx.lineTo(sx, roofY - hh - 21); ctx.moveTo(sx - 7, roofY - hh - 14); ctx.lineTo(sx + 7, roofY - hh - 14); ctx.stroke();
      ctx.fillStyle = '#9b3430'; ctx.beginPath(); ctx.moveTo(sx + 1, roofY - hh - 21); ctx.lineTo(sx + 12, roofY - hh - 17); ctx.lineTo(sx + 1, roofY - hh - 13); ctx.fill();
    } else {
      ctx.fillStyle = '#424b42'; ctx.beginPath(); ctx.ellipse(sx + 5, roofY - hh - 4, 10, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(sx - 5, roofY - hh - 5, 20, 5);
    }
    ctx.strokeStyle = 'rgba(53,39,27,.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx - 16, sy + hh - h + 5); ctx.lineTo(sx + 15, sy + hh - h + 13); ctx.moveTo(sx - 14, sy + hh - h + 14); ctx.lineTo(sx + 17, sy + hh - h + 5); ctx.stroke();
    ctx.strokeStyle = f.powered ? '#d0a638' : '#6d6241'; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(sx + i * 7 - 3, sy + hh - 2); ctx.lineTo(sx + i * 7 + 2, sy + hh + 2); ctx.stroke(); }
  }

  function prism(sx, sy, hw, hh, h, color) {
    ctx.beginPath(); ctx.moveTo(sx-hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx-hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,.68);ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx+hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,.48);ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx,sy-hh-h);ctx.lineTo(sx+hw,sy-h);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx-hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,1.05);ctx.fill();ctx.strokeStyle='rgba(8,12,10,.55)';ctx.lineWidth=1;ctx.stroke();
  }

  function hipRoof(sx,sy,hw,hh,h,color){
    const lift=5;
    ctx.beginPath();ctx.moveTo(sx-hw-2,sy-h);ctx.lineTo(sx,sy-hh-h-lift);ctx.lineTo(sx,sy+hh-h-lift);ctx.closePath();ctx.fillStyle=shade(color,.86);ctx.fill();
    ctx.beginPath();ctx.moveTo(sx+hw+2,sy-h);ctx.lineTo(sx,sy-hh-h-lift);ctx.lineTo(sx,sy+hh-h-lift);ctx.closePath();ctx.fillStyle=shade(color,.62);ctx.fill();
    ctx.strokeStyle='rgba(35,22,18,.72)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx,sy-hh-h-lift);ctx.lineTo(sx,sy+hh-h-lift);ctx.stroke();
    ctx.strokeStyle='rgba(73,43,32,.46)';ctx.lineWidth=.65;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(sx+i*hw*.18,sy-hh*.45-h-lift*.4);ctx.lineTo(sx+i*hw*.14,sy+hh*.72-h-lift*.6);ctx.stroke();}
  }

  function commandWindows(sx,sy,hw,h,rows=2){
    ctx.fillStyle='#242c29';for(let r=0;r<rows;r++){const y=sy-h+7+r*8;for(let c=0;c<2;c++){ctx.fillRect(sx-hw+5+c*7,y,4,4);ctx.fillRect(sx+hw-9-c*7,y,4,4);}}
    ctx.fillStyle='rgba(210,190,116,.5)';for(let r=0;r<rows;r++)ctx.fillRect(sx-hw+6,sy-h+8+r*8,2,1);
  }

  function tank(sx, sy, rx, h, color='#60706a') {
    ctx.fillStyle=shade(color,.56);ctx.fillRect(sx-rx,sy-h,rx*2,h);
    ctx.beginPath();ctx.ellipse(sx,sy-h,rx,rx*.38,0,0,Math.PI*2);ctx.fillStyle=shade(color,1.08);ctx.fill();ctx.strokeStyle='rgba(10,15,13,.65)';ctx.stroke();
    ctx.beginPath();ctx.ellipse(sx,sy,rx,rx*.38,0,0,Math.PI);ctx.fillStyle=shade(color,.62);ctx.fill();
  }

  function facilityModel(sx, sy, f, base) {
    const type=f.type, cat=facInfo(type).cat, lift=Math.min(12,f.level*2);
    const wall=f.powered?'#aaa68f':'#626762',roof=f.powered?'#8c4b3b':'#505550';
    ctx.beginPath();ctx.ellipse(sx,sy+10,35,12,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.28)';ctx.fill();
    if(type===17){ // headquarters: a weathered multi-building command campus
      const wall=f.powered?'#b9b39b':'#666b66',roof=f.powered?'#9b4f3e':'#555a56',flat=f.powered?'#68685c':'#4d514e';
      // rear service buildings frame an open courtyard
      prism(sx-27,sy-4,15,7,17,shade(wall,.93));hipRoof(sx-27,sy-4,15,7,17,roof);commandWindows(sx-27,sy-4,15,17,1);
      prism(sx+27,sy-3,15,7,18,shade(wall,.9));hipRoof(sx+27,sy-3,15,7,18,roof);commandWindows(sx+27,sy-3,15,18,1);
      // garage/workshop wing and its roller door
      prism(sx-29,sy+10,14,7,13,shade(wall,.82));hipRoof(sx-29,sy+10,14,7,13,roof);
      ctx.fillStyle='#343936';ctx.fillRect(sx-38,sy-2,11,10);ctx.strokeStyle='#777565';ctx.lineWidth=.7;for(let y=0;y<3;y++){ctx.beginPath();ctx.moveTo(sx-38,sy+y*3);ctx.lineTo(sx-27,sy+y*3);ctx.stroke();}
      // tall central administration house dominates the campus
      prism(sx,sy-9,16,8,34+lift,wall);hipRoof(sx,sy-9,16,8,34+lift,roof);commandWindows(sx,sy-9,16,34+lift,3);
      ctx.fillStyle='#252b28';ctx.fillRect(sx-3,sy-18,6,9);
      // right gatehouse creates the courtyard entrance
      prism(sx+24,sy+11,13,7,15,shade(wall,.96));hipRoof(sx+24,sy+11,13,7,15,roof);commandWindows(sx+24,sy+11,13,15,1);ctx.fillStyle='#282e2b';ctx.fillRect(sx+18,sy+2,8,9);
      // foreground operations block with flat roof and visible rooftop plant
      prism(sx+1,sy+17,22,9,16,shade(wall,.88));ctx.fillStyle=flat;ctx.beginPath();ctx.moveTo(sx+1,sy-8);ctx.lineTo(sx+23,sy+1);ctx.lineTo(sx+1,sy+10);ctx.lineTo(sx-21,sy+1);ctx.closePath();ctx.fill();ctx.strokeStyle='#332f28';ctx.stroke();commandWindows(sx+1,sy+17,22,16,1);
      tank(sx-5,sy-6,3.5,7,'#606b63');tank(sx+10,sy-1,3,6,'#59635d');
      // courtyard paths, bins, chimneys, and command aerial
      ctx.strokeStyle='#9d8f68';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx-17,sy+5);ctx.lineTo(sx,sy+1);ctx.lineTo(sx+14,sy+6);ctx.stroke();ctx.fillStyle='#424942';ctx.fillRect(sx-18,sy,4,5);ctx.fillRect(sx+12,sy+2,4,5);
      ctx.fillStyle='#4a504b';ctx.fillRect(sx-31,sy-28,4,8);ctx.fillRect(sx+27,sy-29,4,8);
      ctx.strokeStyle='#252c28';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sx,sy-52-lift);ctx.lineTo(sx,sy-67-lift);ctx.moveTo(sx-5,sy-61-lift);ctx.lineTo(sx+5,sy-61-lift);ctx.stroke();
    }else if(type===1){ // life support bunker and water treatment tanks
      prism(sx+5,sy+2,25,11,18+lift*.4,wall);hipRoof(sx+5,sy+2,25,11,18+lift*.4,roof);commandWindows(sx+5,sy+2,25,18+lift*.4,1);tank(sx-24,sy-5,7,20,'#69898a');tank(sx+25,sy-4,7,20,'#69898a');
      ctx.strokeStyle='#84a69b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx-18,sy-6);ctx.lineTo(sx+18,sy+3);ctx.stroke();
    }else if(type===2){ // scrapyard: workshop, crane, piles
      prism(sx+9,sy-1,24,11,16+lift*.35,wall);hipRoof(sx+9,sy-1,24,11,16+lift*.35,roof);commandWindows(sx+9,sy-1,24,16,1);ctx.strokeStyle='#2a2820';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(sx-25,sy+4);ctx.lineTo(sx-25,sy-29);ctx.lineTo(sx+2,sy-18);ctx.stroke();
      ctx.fillStyle='#725640';for(let i=0;i<7;i++){ctx.beginPath();ctx.arc(sx-18+i*5,sy+6-hash(i+f.slot)*8,3,0,Math.PI*2);ctx.fill();}
    }else if(type===3){ // garage: broad shed, roller doors, wreck
      prism(sx,sy,32,14,17+lift*.3,wall);hipRoof(sx,sy,32,14,17+lift*.3,roof);ctx.fillStyle='#252b28';ctx.fillRect(sx-22,sy-12,15,13);ctx.fillRect(sx+7,sy-12,15,13);
      ctx.strokeStyle='#8a8066';ctx.lineWidth=1;for(let y=0;y<4;y++){ctx.beginPath();ctx.moveTo(sx-22,sy-10+y*3);ctx.lineTo(sx-7,sy-10+y*3);ctx.moveTo(sx+7,sy-10+y*3);ctx.lineTo(sx+22,sy-10+y*3);ctx.stroke();}
    }else if(type===11){ // toolshop: smithy hall, forge stack and material yard
      prism(sx+3,sy,29,13,19+lift*.4,wall);hipRoof(sx+3,sy,29,13,19+lift*.4,roof);commandWindows(sx+3,sy,29,19+lift*.4,1);ctx.fillStyle='#292d2a';ctx.fillRect(sx-10,sy-14,12,13);ctx.strokeStyle='#887c65';for(let y=0;y<4;y++){ctx.beginPath();ctx.moveTo(sx-10,sy-12+y*3);ctx.lineTo(sx+2,sy-12+y*3);ctx.stroke();}ctx.fillStyle='#3b403b';ctx.fillRect(sx+20,sy-44-lift*.4,6,27);ctx.fillStyle='#2b302c';for(let i=0;i<3;i++)ctx.fillRect(sx-28+i*8,sy+5-i*2,7,4);ctx.strokeStyle='#bd7b43';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+13,sy+4);ctx.lineTo(sx+22,sy-4);ctx.moveTo(sx+14,sy-4);ctx.lineTo(sx+22,sy+4);ctx.stroke();
    }else if(type===9||cat==='power'){ // generator hall, chimney, cables
      prism(sx+5,sy+1,26,12,20+lift*.5,wall);hipRoof(sx+5,sy+1,26,12,20+lift*.5,roof);commandWindows(sx+5,sy+1,26,20+lift*.5,1);tank(sx-22,sy+1,6,25,'#4e554e');ctx.fillStyle='#383d38';ctx.fillRect(sx+17,sy-45-lift*.5,7,27);
      ctx.strokeStyle='#252c27';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx-19,sy-23);ctx.quadraticCurveTo(sx,sy-34,sx+17,sy-30);ctx.stroke();
    }else if(type===8||cat==='mil'){ // fortified bunker with towers and sandbags
      prism(sx,sy+2,28,13,16+lift*.35,wall);hipRoof(sx,sy+2,28,13,16+lift*.35,roof);prism(sx-25,sy-5,8,5,26,shade(wall,.85));hipRoof(sx-25,sy-5,8,5,26,roof);prism(sx+25,sy-5,8,5,26,shade(wall,.85));hipRoof(sx+25,sy-5,8,5,26,roof);
      ctx.fillStyle='#7e7154';for(let i=-4;i<=4;i++){ctx.beginPath();ctx.ellipse(sx+i*7,sy+10,5,3,0,0,Math.PI*2);ctx.fill();}
    }else if(cat==='medical'){ // clinic with cross and supply canopy
      prism(sx,sy,28,13,21+lift*.45,wall);hipRoof(sx,sy,28,13,21+lift*.45,roof);commandWindows(sx,sy,28,21+lift*.45,2);ctx.fillStyle='#ddd7c3';ctx.fillRect(sx-3,sy-32-lift*.45,6,14);ctx.fillRect(sx-7,sy-28-lift*.45,14,6);tank(sx+24,sy+5,5,13,'#b7b6a5');
    }else if(cat==='research'||cat==='special'){ // lab/radio: modular pods and dish
      prism(sx-8,sy+2,20,10,19+lift*.4,wall);hipRoof(sx-8,sy+2,20,10,19+lift*.4,roof);commandWindows(sx-8,sy+2,20,19+lift*.4,1);prism(sx+17,sy+2,12,7,14,shade(wall,.88));hipRoof(sx+17,sy+2,12,7,14,roof);
      ctx.strokeStyle='#242d28';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx+11,sy-31-lift*.4,10,.15,Math.PI*.9);ctx.stroke();ctx.beginPath();ctx.moveTo(sx+11,sy-31-lift*.4);ctx.lineTo(sx+18,sy-18-lift*.4);ctx.stroke();
    }else{ // storage/trade/core: containers around a hardened central hall
      prism(sx,sy-2,24,11,20+lift*.4,wall);hipRoof(sx,sy-2,24,11,20+lift*.4,roof);commandWindows(sx,sy-2,24,20+lift*.4,2);prism(sx-25,sy+7,11,5,10,shade(wall,.8));hipRoof(sx-25,sy+7,11,5,10,roof);prism(sx+25,sy+7,11,5,10,shade(wall,.9));hipRoof(sx+25,sy+7,11,5,10,roof);
    }
  }

  function building(sx, sy, f) {
    const info=facInfo(f.type),base=f.powered?facColor(f.type):GREY,h=hOf(f.level),hw=(TW/2)*INSET,hh=(TH/2)*INSET;
    facilityModel(sx,sy,f,base);
    if(f.slot===selected){ctx.strokeStyle='#ffe08a';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx,sy-hh-5);ctx.lineTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx-hw,sy);ctx.closePath();ctx.stroke();}
    const label=shortName(info.name);ctx.font='bold 11px system-ui,sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.strokeText(label,sx,sy+hh+15);ctx.fillStyle=f.powered?'#f4ead2':'#c9bfae';ctx.fillText(label,sx,sy+hh+15);
    ctx.fillStyle='rgba(8,12,10,.72)';ctx.fillRect(sx-13,sy+hh+18,26,12);ctx.fillStyle='#d7bf55';ctx.font='bold 10px system-ui,sans-serif';ctx.fillText('Lv '+f.level,sx,sy+hh+27);
  }

  // construction indicator + live countdown badge over an in-progress build
  function buildBadge(sx, sy, f, b) {
    const h = hOf(f.level);
    const hw = (TW / 2) * INSET, hh = (TH / 2) * INSET;
    // dashed cyan roof outline = under construction
    ctx.save();
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#67d5e0'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - hh - h); ctx.lineTo(sx + hw, sy - h);
    ctx.lineTo(sx, sy + hh - h); ctx.lineTo(sx - hw, sy - h);
    ctx.closePath(); ctx.stroke();
    ctx.restore();

    const remaining = b.due - Date.now() / 1000;
    const txt = remaining > 0 ? '⏳ ' + fmtDuration(remaining) + '  → L' + b.toLevel : '✓ finishing…';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(txt).width + 16;
    const bx = sx - w / 2, by = sy - hh - h - 32;
    ctx.fillStyle = 'rgba(12,30,34,0.92)';
    ctx.beginPath(); ctx.roundRect(bx, by, w, 19, 5); ctx.fill();
    ctx.strokeStyle = '#67d5e0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, w, 19, 5); ctx.stroke();
    ctx.fillStyle = '#c9f2f6';
    ctx.fillText(txt, sx, by + 13.5);
  }

  function title(state) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(state.name, 17, 31);
    ctx.fillStyle = '#f4ead2';
    ctx.fillText(state.name, 16, 30);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#d9c9a8';
    ctx.fillText(`Level ${state.level} · ${state.points} pts · (${state.location.x}|${state.location.y})`, 16, 48);
  }

  function render(state) {
    ctx.clearRect(0, 0, W, H);
    sky();
    ctx.save();ctx.translate(W/2,H/2);ctx.scale(cam.zoom,cam.zoom);ctx.translate(-W/2,-H/2);

    const placed = layout(state.facilities);
    const gw=state.grid?.w||7,gh=state.grid?.h||7,gridCells=[];for(let r=0;r<gh;r++)for(let c=0;c<gw;c++)gridCells.push({r,c});
    // center the full compound grid
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of gridCells) {
      const [ox, oy] = isoXY(cell.r, cell.c);
      if (ox < minX) minX = ox; if (ox > maxX) maxX = ox;
      if (oy < minY) minY = oy; if (oy > maxY) maxY = oy;
    }
    const originX = W / 2 - (minX + maxX) / 2 + cam.x;
    const originY = H / 2 - (minY + maxY) / 2 - 30 + cam.y;

    // painter's order: back (small r+c) to front
    placed.sort((a, b) => (a.r + a.c) - (b.r + b.c));
    const compoundPoints=[];emptyPlacements=[];const occupied=new Set(placed.map(f=>`${f.c}|${f.r}`));
    for (const cell of gridCells) {
      const [ox, oy] = isoXY(cell.r, cell.c);
      const sx = originX + ox, sy = originY + oy;
      compoundPoints.push({sx,sy});
      const isEmpty=!occupied.has(`${cell.c}|${cell.r}`);tilePlate(sx,sy,true,isEmpty);if(isEmpty)emptyPlacements.push({empty:true,gridX:cell.c,gridY:cell.r,sx,sy});
    }
    compoundPerimeter(compoundPoints);
    const buildMap = new Map((state.builds || []).map((b) => [b.slot, b]));
    placements = [];
    const badges = [];
    for (const f of placed) {
      const [ox, oy] = isoXY(f.r, f.c);
      const sx = originX + ox, sy = originY + oy;
      placements.push({ slot: f.slot, type: f.type, sx, sy, level: f.level });
      building(sx, sy, f);
      const b = buildMap.get(f.slot);
      if (b) badges.push({ sx, sy, f, b });
    }
    for (const a of badges) buildBadge(a.sx, a.sy, a.f, a.b);   // on top of all buildings
    if (state.world?.phase === 'night') {
      ctx.fillStyle = 'rgba(12,18,42,.28)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    title(state);
  }

  // --- the wasteland: a 50x50 ruined city under per-player fog (P3 discovery) ---
  const WS = 0.64;                 // readable city blocks while still showing a large district
  let worldPlacements = [];        // [{t, sx, sy}] captured each render, for hit-testing

  function microBuilding(sx,sy,hw,hh,h,color,seed,lit=true){
    ctx.beginPath();ctx.moveTo(sx-hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx-hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,.62);ctx.fill();
    ctx.beginPath();ctx.moveTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx+hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,.43);ctx.fill();
    ctx.beginPath();ctx.moveTo(sx,sy-hh-h);ctx.lineTo(sx+hw,sy-h);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx-hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,.92+hash(seed)*.24);ctx.fill();ctx.strokeStyle='rgba(5,9,8,.55)';ctx.lineWidth=.7;ctx.stroke();
    if(hash(seed+2)>.52){ctx.fillStyle='#202724';ctx.beginPath();ctx.moveTo(sx-hw*.2,sy-h-hh*.8);ctx.lineTo(sx+hw*.72,sy-h);ctx.lineTo(sx+hw*.15,sy-h+hh*.45);ctx.fill();}
    ctx.fillStyle=lit?'rgba(184,198,105,.48)':'rgba(8,13,12,.65)';const floors=Math.min(4,Math.max(1,Math.floor(h/5)));for(let f=0;f<floors;f++){ctx.fillRect(sx+hw*.3,sy-h+3+f*5,1.5,2);ctx.fillRect(sx-hw*.65,sy-h+3+f*5,1.5,2);}
    if(hash(seed+6)>.62){ctx.strokeStyle='#333c36';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(sx+hw*.75,sy-h*.8);ctx.lineTo(sx+hw*.75,sy-2);for(let y=4;y<h;y+=6){ctx.moveTo(sx+hw*.55,sy-y);ctx.lineTo(sx+hw*.95,sy-y);}ctx.stroke();}
  }

  function cityGround(sx,sy,hw,hh,seen,seed){
    ctx.beginPath();ctx.moveTo(sx,sy-hh);ctx.lineTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx-hw,sy);ctx.closePath();ctx.fillStyle=seen?'#303733':'#151d1b';ctx.fill();ctx.strokeStyle=seen?'rgba(136,129,94,.25)':'rgba(60,70,63,.18)';ctx.stroke();
    const iw=hw*.77,ih=hh*.72;ctx.beginPath();ctx.moveTo(sx,sy-ih);ctx.lineTo(sx+iw,sy);ctx.lineTo(sx,sy+ih);ctx.lineTo(sx-iw,sy);ctx.closePath();ctx.fillStyle=seen?'#595b4d':'#232b27';ctx.fill();
    ctx.strokeStyle=seen?'rgba(210,190,100,.3)':'rgba(100,110,77,.1)';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(sx-hw,sy);ctx.lineTo(sx,sy+hh);ctx.stroke();ctx.setLineDash([]);
    if(seen&&hash(seed+9)>.55){ctx.fillStyle=hash(seed+10)>.5?'#743e35':'#58605a';ctx.fillRect(sx+hw*.72,sy-2,5,2.5);ctx.fillStyle='#171c1a';ctx.fillRect(sx+hw*.73,sy-2.5,1,3.5);}
  }

  function fogCity(sx,sy,seed){
    const count=2+Math.floor(hash(seed)*3);for(let i=0;i<count;i++){const ox=(hash(seed+i*7)-.5)*25,oy=(hash(seed+i*11)-.5)*6;microBuilding(sx+ox,sy+oy,3.5+hash(seed+i)*3,2+hash(seed+i+1)*1.5,5+hash(seed+i+2)*16,'#202a26',seed+i,false);}
  }

  function cityLot(sx,sy,t,color){
    const seed=t.x*97+t.y*193,rooms=t.rooms||4;
    if(t.home){microBuilding(sx,sy-2,9,4.5,24,'#b39343',seed);microBuilding(sx-10,sy+3,6,3,11,'#736b48',seed+1);microBuilding(sx+10,sy+3,6,3,13,'#736b48',seed+2);ctx.strokeStyle='#c6a84c';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sx-19,sy+2);ctx.lineTo(sx,sy+11);ctx.lineTo(sx+19,sy+2);ctx.stroke();return;}
    const count=Math.min(5,2+Math.floor(rooms/3)),spots=[[-9,-2],[4,-4],[-2,3],[10,2],[-12,4]];
    for(let i=0;i<count;i++){const [ox,oy]=spots[i],height=6+hash(seed+i*13)*Math.min(27,10+rooms*.8);microBuilding(sx+ox,sy+oy,4+hash(seed+i)*3,2.2+hash(seed+i+5)*1.8,height,shade(color,.78+hash(seed+i+8)*.25),seed+i,true);}
    ctx.fillStyle='#4d633b';for(let i=0;i<2;i++){const ox=(hash(seed+40+i)-.5)*25,oy=4+hash(seed+50+i)*4;ctx.beginPath();ctx.arc(sx+ox,sy+oy-3,2.3,0,Math.PI*2);ctx.fill();}if(hash(seed+70)>.76)tank(sx+8,sy-9,2.8,8,'#596560');
  }

  function renderWorld(map) {
    ctx.clearRect(0, 0, W, H);
    sky();
    const originX = W / 2 + cam.x, originY = H / 2 - 20 + cam.y;
    const hw = (TW / 2) * WS * 0.94, hh = (TH / 2) * WS * 0.94;

    worldPlacements = [];
    for (const t of [...map.tiles].sort((a, b) => (a.x + a.y) - (b.x + b.y))) {
      const [ox, oy] = isoXY(t.y - map.player.y, t.x - map.player.x);
      const sx = originX + ox * WS, sy = originY + oy * WS;
      worldPlacements.push({ t, sx, sy });

      const seed = t.x * 97 + t.y * 193;
      cityGround(sx, sy, hw, hh, t.seen, seed);

      if (!t.seen) {                                   // fog
        fogCity(sx, sy, seed);
        if (t.scoutable) {                             // the frontier — click to explore
          ctx.save(); ctx.setLineDash([3, 2]);
          ctx.beginPath(); ctx.moveTo(sx,sy-hh);ctx.lineTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx-hw,sy);ctx.closePath();
          ctx.strokeStyle = '#d7bf55'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        }
        continue;
      }

      const color = t.home ? '#ffd15a' : cityColor(t.name);
      cityLot(sx, sy, t, color);
      if (!t.home && (t.rooms || 0) > 12) {
        ctx.fillStyle = '#9e332f'; ctx.beginPath(); ctx.arc(sx + hw * .72, sy - 4, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // labels last, above the skyline
    ctx.textAlign = 'center';
    for (const { t, sx, sy } of worldPlacements) {
      if (!t.seen) continue;
      const label = t.home ? '★ ' + t.name : shortName(t.name);
      ctx.font = (t.home ? 'bold 11px ' : '10px ') + 'system-ui, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(label, sx, sy + 15);
      ctx.fillStyle = t.home ? '#fff' : '#e8dcc4';
      ctx.fillText(label, sx, sy + 15);
    }

    for (const squad of (map.squads || (map.squad ? [map.squad] : []))) {
      const here = worldPlacements.find((p) => p.t.x === squad.x && p.t.y === squad.y);
      const target = squad.traveling ? worldPlacements.find((p) => p.t.x === squad.targetX && p.t.y === squad.targetY) : null;
      let markerX=here?.sx,markerY=here?.sy-13;
      if (here && target) {
        const duration=Math.max(1,squad.arrivesAt-squad.startedAt),progress=Math.max(0,Math.min(1,(Date.now()/1000-squad.startedAt)/duration));
        markerX=here.sx+(target.sx-here.sx)*progress;markerY=here.sy-13+(target.sy-here.sy)*progress;
        const active=squad.id===map.squad?.id;ctx.strokeStyle=active?'rgba(235,205,91,.7)':'rgba(125,175,190,.55)';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(here.sx,here.sy-13);ctx.lineTo(target.sx,target.sy-13);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle=active?'#d7bf55':'#7fabb5';ctx.strokeRect(target.sx-7,target.sy-20,14,14);
        for(let i=1;i<=3;i++){const p=Math.max(0,progress-i*.045);ctx.fillStyle=active?`rgba(215,191,85,${.42-i*.09})`:`rgba(120,175,190,${.42-i*.09})`;ctx.beginPath();ctx.arc(here.sx+(target.sx-here.sx)*p,here.sy-13+(target.sy-here.sy)*p,2,0,Math.PI*2);ctx.fill();}
      }
      if (Number.isFinite(markerX)&&Number.isFinite(markerY)) { const active=squad.id===map.squad?.id;ctx.fillStyle=active?(squad.traveling?'#ffd75a':'#eef0c6'):'#83b4bf';ctx.beginPath();ctx.arc(markerX,markerY,active?7:6,0,Math.PI*2);ctx.fill();ctx.strokeStyle=active?'#ffe07b':'#18211c';ctx.lineWidth=active?2.5:2;ctx.stroke();ctx.fillStyle='#18211c';ctx.font='bold 8px system-ui';ctx.textAlign='center';ctx.fillText((squad.name||'S')[0],markerX,markerY+3);ctx.font='9px system-ui';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.strokeText(squad.name,markerX,markerY-10);ctx.fillStyle=active?'#ffe28a':'#b8d4d7';ctx.fillText(squad.name,markerX,markerY-10); }
    }

    const seen = map.tiles.filter((t) => t.seen).length;
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText('The Wasteland', 17, 31);
    ctx.fillStyle = '#f4ead2'; ctx.fillText('The Wasteland', 16, 30);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#d9c9a8';
    ctx.fillText(`${map.squad?.name||'Squad'} selected · ${seen} of ${map.tiles.length} places known nearby · click a dashed tile to explore`, 16, 48);
  }

  // hit-test the world map: screen px -> tile (diamond test). null if none.
  function worldPick(x, y) {
    const hw = (TW / 2) * WS * 0.94, hh = (TH / 2) * WS * 0.94;
    for (let i = worldPlacements.length - 1; i >= 0; i--) {
      const p = worldPlacements[i];
      if (Math.abs(x - p.sx) / hw + Math.abs(y - p.sy) / hh <= 1) return p.t;
    }
    return null;
  }

  // hit-test screen px -> facility (front-most first). null if empty space.
  function pick(x, y) {
    x=W/2+(x-W/2)/cam.zoom;y=H/2+(y-H/2)/cam.zoom;
    for (let i = placements.length - 1; i >= 0; i--) {
      const p = placements[i];
      const hw = (TW / 2) * INSET, hh = (TH / 2) * INSET, h = hOf(p.level);
      if (x >= p.sx - hw && x <= p.sx + hw && y >= p.sy - h - hh && y <= p.sy + hh) return p;
    }
    for(let i=emptyPlacements.length-1;i>=0;i--){const p=emptyPlacements[i],hw=TW/2,hh=TH/2;if(Math.abs(x-p.sx)/hw+Math.abs(y-p.sy)/hh<=1)return p;}
    return null;
  }
  function setSelected(slot) { selected = slot; }

  function setZoom(value){cam.zoom=Math.max(.55,Math.min(1.7,value));}
  return { render, renderWorld, resize, cam, pick, worldPick, setSelected, setZoom };
}
