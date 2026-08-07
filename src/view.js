// Isometric renderer: draws the stronghold as a living compound (SOTD feel).
// Read-only for now — facilities laid out on an iso grid, extruded by level,
// coloured by category, dark when unpowered.
import { TW, TH, WORLD_SCALE, isoXY, facInfo, facColor, facRange, fmtDuration, cityColor } from './config.js';
import { t } from './i18n.js';
import { getSprite, getAnchor, getScale, onSpritesChanged } from './sprites.js';

// Generated sprites are drawn a little wider than one tile so a compound reads
// as buildings crowding their plot rather than models parked on coasters.
const SPRITE_W = TW * 1.0;

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
  // Compound opens zoomed out: the 16x16 settlement spans ~1344px of tile at 1:1,
  // wider than the canvas, and the whole point is reading the layout at a glance.
  const cam = { x: 0, y: 0, zoom: .55, worldZoom: .48, rot: 0 };   // rot: radians, SOTD right-drag rotate
  let W = 0, H = 0;
  let gridDims = { w: 7, h: 7 };   // last compound grid, for centerCompoundOn

  // pre-transform point -> actual screen px under the current rotation+zoom
  function rotP(sx, sy, z) {
    const cos = Math.cos(cam.rot), sin = Math.sin(cam.rot);
    const dx = sx - W / 2, dy = sy - H / 2;
    return [W / 2 + (dx * cos - dy * sin) * z, H / 2 + (dx * sin + dy * cos) * z];
  }
  // screen px -> pre-transform point (inverse of rotP), for hit-testing
  function unrotP(px, py, z) {
    const cos = Math.cos(cam.rot), sin = Math.sin(cam.rot);
    const dx = px - W / 2, dy = py - H / 2;
    return [W / 2 + (dx * cos + dy * sin) / z, H / 2 + (-dx * sin + dy * cos) / z];
  }
  let placements = [];        // [{slot,type,sx,sy,level}] captured each render, for hit-testing
  let emptyPlacements = [];
  let selected = null;        // selected facility slot (highlighted)
  let selectedCell = null;    // selected empty compound plot {gx,gy} (highlighted)
  let raidAnimation = null;
  let raidFrame = 0;
  let lastCompoundState = null;

  function startRaidAnimation(raid) {
    raidAnimation = { raid, started: performance.now(), duration: 7600 };
    if (lastCompoundState && !raidFrame) raidFrame = requestAnimationFrame(() => { raidFrame = 0; render(lastCompoundState); });
  }

  function raidZombie(x, y, scale, fallen=false, alpha=1) {
    ctx.save();ctx.translate(x,y);ctx.rotate(fallen?1.35:0);ctx.globalAlpha=alpha;ctx.strokeStyle='#151b17';ctx.fillStyle='#62705c';ctx.lineWidth=Math.max(1,scale);
    ctx.beginPath();ctx.arc(0,-8*scale,3.3*scale,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,-5*scale);ctx.lineTo(0,5*scale);ctx.moveTo(0,-1*scale);ctx.lineTo(-5*scale,3*scale);ctx.moveTo(0,-1*scale);ctx.lineTo(5*scale,2*scale);ctx.moveTo(0,5*scale);ctx.lineTo(-4*scale,11*scale);ctx.moveTo(0,5*scale);ctx.lineTo(4*scale,11*scale);ctx.stroke();ctx.restore();
  }

  function drawRaidAnimation() {
    if (!raidAnimation) return;
    const elapsed=performance.now()-raidAnimation.started,p=Math.min(1,elapsed/raidAnimation.duration),raid=raidAnimation.raid,breached=!raid.success;
    const wallY=Math.min(H-105,H*.73),approach=Math.min(1,p/.72),ease=1-Math.pow(1-approach,2),zombies=[];
    ctx.save();ctx.fillStyle=`rgba(70,8,6,${.08+Math.sin(p*Math.PI)*.12})`;ctx.fillRect(0,82,W,H-82);
    for(let i=0;i<18;i++){const lane=.14+hash(i+raid.time)*.72,targetX=W*lane,delay=(i%6)*.035,local=Math.max(0,Math.min(1,(approach-delay)/(1-delay))),targetY=breached?wallY+hash(i+4)*18:wallY+58+hash(i+4)*34;const y=H+28+(targetY-(H+28))*(1-Math.pow(1-local,2));const x=targetX+Math.sin(p*28+i)*5;const fallen=!breached&&p>.66+(i%5)*.025;const alpha=fallen?Math.max(.18,1-(p-.68)*2.4):1;raidZombie(x,y,.75+hash(i+9)*.45,fallen,alpha);zombies.push({x,y});}
    if(p>.1&&p<.82){const volley=Math.floor(elapsed/95);ctx.lineWidth=1.2;for(let i=0;i<7;i++){if(hash(volley*11+i)<.42)continue;const gunX=W*(i%2?.43:.57)+(i-3)*4,gunY=H*.47+(i%3)*6,target=zombies[(volley+i*3)%zombies.length];ctx.strokeStyle=`rgba(255,210,91,${.38+hash(volley+i)*.5})`;ctx.beginPath();ctx.moveTo(gunX,gunY);ctx.lineTo(target.x,target.y-5);ctx.stroke();ctx.fillStyle='#fff1a6';ctx.beginPath();ctx.arc(gunX,gunY,2.5+hash(volley+i)*2,0,Math.PI*2);ctx.fill();}}
    if(breached&&p>.72){ctx.fillStyle=`rgba(150,27,18,${(p-.72)*.5})`;ctx.fillRect(0,82,W,H-82);ctx.strokeStyle='#e05743';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(W*.28,wallY);ctx.lineTo(W*.34,wallY-9);ctx.lineTo(W*.39,wallY+7);ctx.stroke();}
    const outcome=t(p<.68?'DEFEND THE COMPOUND':(breached?'WALL BREACHED':'HORDE REPELLED'));ctx.textAlign='center';ctx.font='900 18px system-ui,sans-serif';ctx.lineWidth=5;ctx.strokeStyle='rgba(0,0,0,.8)';ctx.strokeText(outcome,W/2,116);ctx.fillStyle=breached?'#ef7462':'#d8c76e';ctx.fillText(outcome,W/2,116);ctx.font='11px system-ui,sans-serif';ctx.fillStyle='#ddd4bd';ctx.fillText(t(`Defence ${raid.defense} vs threat ${raid.threat}`),W/2,134);ctx.restore();
    if(p>=1)raidAnimation=null;else if(!raidFrame)raidFrame=requestAnimationFrame(()=>{raidFrame=0;if(lastCompoundState)render(lastCompoundState);});
  }

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

  // Bright highlight for the currently-selected empty compound plot, so a click
  // on open ground reads as selected the way a facility does.
  function selectedTile(sx, sy) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, sy - TH / 2); ctx.lineTo(sx + TW / 2, sy);
    ctx.lineTo(sx, sy + TH / 2); ctx.lineTo(sx - TW / 2, sy); ctx.closePath();
    ctx.fillStyle = 'rgba(255,224,138,.16)'; ctx.fill();
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
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

  // Generated sprite for a facility, anchored on its tile: centred horizontally,
  // base resting on the tile's bottom vertex. False when no sprite has decoded,
  // which is the caller's cue to fall back to the procedural model.
  function facilitySprite(sx, sy, f) {
    const key = facInfo(f.type).key, img = getSprite(key);
    if (!img) return false;
    const dw = SPRITE_W * getScale(key), dh = dw * img.naturalHeight / img.naturalWidth;
    ctx.beginPath();ctx.ellipse(sx,sy+10,35,12,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.28)';ctx.fill();
    // Sprites are lit for the powered state, so an unpowered building is drained
    // here the same way facilityModel() swaps to its grey palette.
    if (!f.powered) ctx.filter = 'grayscale(.85) brightness(.55)';
    // Land the building's footprint on the tile, not the bounding box bottom:
    // artwork with a detached prop below it would otherwise hang in the air.
    ctx.drawImage(img, sx - dw / 2, sy + TH / 2 - dh * getAnchor(key) + 2, dw, dh);
    ctx.filter = 'none';
    return true;
  }

  // Pre-built settlement housing: drawn procedurally rather than from sprites so
  // ten of them cost nothing to load, and kept visually quieter than the
  // facilities so the buildings a player actually owns still read first.
  function house(sx, sy, s) {
    const wall = ['#8d8672', '#7f7b69', '#948a71', '#837f6d'][s.variant % 4];
    const roof = ['#6d4136', '#5f4a3a', '#77473a', '#5a4033'][s.variant % 4];
    const hw = (TW / 2) * 0.74, hh = (TH / 2) * 0.74, h = 15 + (s.variant % 3) * 4;
    ctx.beginPath(); ctx.ellipse(sx, sy + 8, 26, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fill();
    prism(sx, sy, hw, hh, h, wall);
    hipRoof(sx, sy, hw, hh, h, roof);
    ctx.fillStyle = 'rgba(28,32,28,.85)';
    ctx.fillRect(sx - 4, sy - h + 4, 4, 5); ctx.fillRect(sx + 2, sy - h + 4, 4, 5);
    const ruined = s.hp < s.maxHp * 0.6;
    if (ruined) { ctx.strokeStyle = 'rgba(30,22,18,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - hw * .5, sy - h); ctx.lineTo(sx, sy - h + 7); ctx.stroke(); }
  }

  // A gateway is a gap in the wall with a post either side. The main gate is
  // wider and braced -- it is where the bulk of a wave comes through.
  function gate(sx, sy, s) {
    const main = s.kind === 'gate_main';
    const w = main ? 15 : 11, postH = main ? 26 : 20;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 6, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
    for (const dx of [-w, w]) {
      ctx.fillStyle = '#4a4638'; ctx.fillRect(sx + dx - 3, sy - postH, 6, postH);
      ctx.fillStyle = '#5d5844'; ctx.fillRect(sx + dx - 3, sy - postH, 6, 4);
    }
    ctx.strokeStyle = main ? '#c2a049' : '#8a8266'; ctx.lineWidth = main ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(sx - w, sy - postH + 3); ctx.lineTo(sx + w, sy - postH + 3); ctx.stroke();
    if (main) { ctx.strokeStyle = 'rgba(196,160,73,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - w, sy - 4); ctx.lineTo(sx + w, sy - 12); ctx.stroke(); }
  }

  // Coverage ring for the selected emplacement: the honest footprint of what it
  // can reach, drawn on the ground plane so it can be compared against the lanes.
  function rangeRing(sx, sy, tiles) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,196,92,.5)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(sx, sy, tiles * TW / 2, tiles * TH / 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,196,92,.06)'; ctx.fill();
    ctx.restore();
  }

  function building(sx, sy, f, labels) {
    const info=facInfo(f.type),base=f.powered?facColor(f.type):GREY,hw=(TW/2)*INSET,hh=(TH/2)*INSET;
    if (!facilitySprite(sx, sy, f)) facilityModel(sx,sy,f,base);
    // Symmetric diamond: the top vertex used to carry an extra -5, which skewed
    // the selection ring into a lopsided quadrilateral instead of a tile outline.
    if(f.slot===selected){ctx.strokeStyle='#ffe08a';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx,sy-hh);ctx.lineTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx-hw,sy);ctx.closePath();ctx.stroke();}
    // labels stay upright regardless of view rotation — drawn in a screen-space pass
    // The screen-space pass draws the whole block BELOW this anchor -- name at
    // +11, level chip down to +26 -- so anchoring at the tile's bottom vertex hung
    // it into the row in front. Sit it above centre so the block lands on the tile.
    labels.push({ text: shortName(info.label || info.name), lv: f.level, sx, sy: sy - 6, powered: f.powered });
  }

  // upright construction countdown badge (screen space, constant size)
  function buildBadgeScreen(px, py, b) {
    const remaining = b.due - Date.now() / 1000;
    const txt = remaining > 0 ? '⏳ ' + fmtDuration(remaining) + '  → L' + b.toLevel : '✓ finishing…';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(txt).width + 16;
    const bx = px - w / 2, by = py - 58;
    ctx.fillStyle = 'rgba(12,30,34,0.92)';
    ctx.beginPath(); ctx.roundRect(bx, by, w, 19, 5); ctx.fill();
    ctx.strokeStyle = '#67d5e0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, w, 19, 5); ctx.stroke();
    ctx.fillStyle = '#c9f2f6';
    ctx.fillText(txt, px, by + 13.5);
  }

  const TITLE_Y = 108;   // below the OG header bar
  function title(state) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(state.name, 17, TITLE_Y + 1);
    ctx.fillStyle = '#f4ead2';
    ctx.fillText(state.name, 16, TITLE_Y);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#d9c9a8';
    ctx.fillText(t(`Level ${state.level} · ${state.points} pts · (${state.location.x}|${state.location.y})`), 16, TITLE_Y + 18);
  }

  function render(state) {
    lastCompoundState = state;
    ctx.clearRect(0, 0, W, H);
    sky();
    ctx.save();ctx.translate(W/2,H/2);ctx.rotate(cam.rot);ctx.scale(cam.zoom,cam.zoom);ctx.translate(-W/2,-H/2);

    const placed = layout(state.facilities);
    const gw=state.grid?.w||7,gh=state.grid?.h||7,gridCells=[];for(let r=0;r<gh;r++)for(let c=0;c<gw;c++)gridCells.push({r,c});
    gridDims={w:gw,h:gh};
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
    // Houses and gateways hold their cells against construction, so they count as
    // occupied for the empty-plot pass just as facilities do.
    const structures = (state.structures || []).map((s) => ({ ...s, r: s.gridY, c: s.gridX }));
    const compoundPoints=[];emptyPlacements=[];
    const occupied=new Set([...placed.map(f=>`${f.c}|${f.r}`), ...structures.map(s=>`${s.c}|${s.r}`)]);
    let selCell=null;
    for (const cell of gridCells) {
      const [ox, oy] = isoXY(cell.r, cell.c);
      const sx = originX + ox, sy = originY + oy;
      compoundPoints.push({sx,sy});
      const isEmpty=!occupied.has(`${cell.c}|${cell.r}`);tilePlate(sx,sy,true,isEmpty);if(isEmpty){emptyPlacements.push({empty:true,gridX:cell.c,gridY:cell.r,sx,sy});if(selectedCell&&selectedCell.gx===cell.c&&selectedCell.gy===cell.r)selCell={sx,sy};}
    }
    if(selCell)selectedTile(selCell.sx,selCell.sy);
    compoundPerimeter(compoundPoints);
    const buildMap = new Map((state.builds || []).map((b) => [b.slot, b]));
    placements = [];
    const badges = [];
    const labels = [];
    // Structures and facilities share one painter's pass -- sorted apart, a house
    // in front of a facility would draw behind it and the depth would break.
    const drawList = [
      ...placed.map((f) => ({ kind: 'facility', r: f.r, c: f.c, f })),
      ...structures.map((s) => ({ kind: s.kind, r: s.r, c: s.c, s })),
    ].sort((a, b) => (a.r + a.c) - (b.r + b.c));

    // Coverage ring goes under everything so buildings are never obscured by it.
    for (const f of placed) {
      if (f.slot !== selected) continue;
      const reach = facRange(f.type, f.level);
      if (!reach) continue;
      const [ox, oy] = isoXY(f.r, f.c);
      rangeRing(originX + ox, originY + oy, reach);
    }

    for (const item of drawList) {
      const [ox, oy] = isoXY(item.r, item.c);
      const sx = originX + ox, sy = originY + oy;
      if (item.kind === 'facility') {
        const f = item.f;
        placements.push({ slot: f.slot, type: f.type, sx, sy, level: f.level });
        building(sx, sy, f, labels);
        const b = buildMap.get(f.slot);
        if (b) badges.push({ sx, sy, b });
      } else if (item.kind === 'house') {
        house(sx, sy, item.s);
      } else {
        gate(sx, sy, item.s);
      }
    }
    ctx.restore();
    // screen-space pass: upright labels, badges, and the night tint (covers all corners under rotation)
    ctx.textAlign = 'center';
    for (const l of labels) {
      const [px, py] = rotP(l.sx, l.sy, cam.zoom);
      ctx.font = 'bold 11px system-ui,sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(l.text, px, py + 11); ctx.fillStyle = l.powered ? '#f4ead2' : '#c9bfae'; ctx.fillText(l.text, px, py + 11);
      ctx.fillStyle = 'rgba(8,12,10,.72)'; ctx.fillRect(px - 13, py + 14, 26, 12);
      ctx.fillStyle = '#d7bf55'; ctx.font = 'bold 10px system-ui,sans-serif'; ctx.fillText('Lv ' + l.lv, px, py + 23);
    }
    for (const a of badges) { const [px, py] = rotP(a.sx, a.sy, cam.zoom); buildBadgeScreen(px, py, a.b); }
    if (state.world?.phase === 'night') {
      ctx.fillStyle = 'rgba(12,18,42,.28)';
      ctx.fillRect(0, 0, W, H);
    }
    drawRaidAnimation();
    title(state);
  }

  // --- the wasteland: a 50x50 ruined city under per-player fog (P3 discovery) ---
  const WS = WORLD_SCALE;          // readable city blocks while still showing a large district
  let worldPlacements = [];        // [{t, sx, sy}] captured each render, for hit-testing

  function microBuilding(sx,sy,hw,hh,h,color,seed,lit=true){
    ctx.beginPath();ctx.moveTo(sx-hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx-hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,.62);ctx.fill();
    ctx.beginPath();ctx.moveTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx+hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,.43);ctx.fill();
    ctx.beginPath();ctx.moveTo(sx,sy-hh-h);ctx.lineTo(sx+hw,sy-h);ctx.lineTo(sx,sy+hh-h);ctx.lineTo(sx-hw,sy-h);ctx.closePath();ctx.fillStyle=shade(color,.92+hash(seed)*.24);ctx.fill();ctx.strokeStyle='rgba(5,9,8,.55)';ctx.lineWidth=.7;ctx.stroke();
    if(hash(seed+2)>.52){ctx.fillStyle='#202724';ctx.beginPath();ctx.moveTo(sx-hw*.2,sy-h-hh*.8);ctx.lineTo(sx+hw*.72,sy-h);ctx.lineTo(sx+hw*.15,sy-h+hh*.45);ctx.fill();}
    ctx.fillStyle=lit?'rgba(184,198,105,.48)':'rgba(8,13,12,.65)';const floors=Math.min(4,Math.max(1,Math.floor(h/5)));for(let f=0;f<floors;f++){ctx.fillRect(sx+hw*.3,sy-h+3+f*5,1.5,2);ctx.fillRect(sx-hw*.65,sy-h+3+f*5,1.5,2);}
    if(hash(seed+6)>.62){ctx.strokeStyle='#333c36';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(sx+hw*.75,sy-h*.8);ctx.lineTo(sx+hw*.75,sy-2);for(let y=4;y<h;y+=6){ctx.moveTo(sx+hw*.55,sy-y);ctx.lineTo(sx+hw*.95,sy-y);}ctx.stroke();}
  }

  function diamond(sx,sy,hw,hh,fill,stroke='rgba(50,60,55,.25)'){
    ctx.beginPath();ctx.moveTo(sx,sy-hh);ctx.lineTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx-hw,sy);ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.stroke();
  }
  function cityTree(x,y,seed,muted=false){ctx.fillStyle=muted?'#26342d':'#415b38';ctx.beginPath();ctx.arc(x,y-4,2.2+hash(seed)*1.5,0,Math.PI*2);ctx.fill();ctx.fillStyle=muted?'#17201c':'#232b20';ctx.fillRect(x-.55,y-3,1.1,4);}
  function districtColor(t,f=1){const palette={Mitte:'#8c8172',Kreuzberg:'#766e62','Friedrichshain':'#806b5c','Prenzlauer Berg':'#8d7967',Charlottenburg:'#777d73',Schöneberg:'#7b756b',Neukölln:'#70685f',Tempelhof:'#747166',Pankow:'#718071',Spandau:'#68746d',Lichtenberg:'#6f756c',Köpenick:'#65766b'};return shade(palette[t.district]||'#74766c',f);}
  function cityGround(sx,sy,hw,hh,t,seed){
    const seen=t.seen,muted=!seen;
    if(t.terrain==='water'||t.terrain==='bridge'){
      diamond(sx,sy,hw,hh,muted?'#122329':'#244650',muted?'rgba(41,77,84,.25)':'rgba(104,157,169,.42)');
      ctx.strokeStyle=muted?'rgba(60,99,107,.18)':'rgba(135,190,198,.38)';ctx.lineWidth=1;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(sx-hw*.75,sy+i*3);ctx.quadraticCurveTo(sx,sy+i*3-2,sx+hw*.75,sy+i*3);ctx.stroke();}
      if(t.terrain==='bridge'){ctx.strokeStyle=muted?'#343c39':'#77766b';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(sx-hw,sy);ctx.lineTo(sx+hw,sy);ctx.stroke();ctx.strokeStyle='#262b28';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);}return;
    }
    const base=t.terrain==='park'?(muted?'#17251c':'#354b30'):(t.terrain==='forest'?(muted?'#111b16':'#263b2b'):(muted?'#151d1b':'#303733'));diamond(sx,sy,hw,hh,base,seen?'rgba(136,129,94,.25)':'rgba(60,70,63,.18)');
    const iw=hw*.77,ih=hh*.72;diamond(sx,sy,iw,ih,t.terrain==='park'?(muted?'#1d2e22':'#49613c'):(t.terrain==='forest'?(muted?'#16231b':'#304a34'):(muted?'#232b27':'#595b4d')),'transparent');
    if(t.terrain==='park'){ctx.strokeStyle=muted?'rgba(92,105,78,.16)':'rgba(194,181,127,.35)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(sx-hw*.7,sy+hh*.2);ctx.quadraticCurveTo(sx,sy-hh*.4,sx+hw*.72,sy+hh*.15);ctx.stroke();}
    if(t.road){const vertical=t.road==='ns'||(t.road==='ring'&&Math.abs(t.x-25.5)>Math.abs(t.y-25.5));ctx.strokeStyle=muted?'#242b29':'#444944';ctx.lineWidth=t.road==='ring'?6:5;ctx.beginPath();if(vertical){ctx.moveTo(sx,sy-hh);ctx.lineTo(sx,sy+hh);}else{ctx.moveTo(sx-hw,sy);ctx.lineTo(sx+hw,sy);}ctx.stroke();ctx.strokeStyle=muted?'rgba(95,98,83,.12)':'rgba(205,185,111,.38)';ctx.lineWidth=.8;ctx.setLineDash([4,4]);ctx.stroke();ctx.setLineDash([]);}
    if(t.rail){ctx.strokeStyle=muted?'#202725':'#303632';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx-hw*.9,sy-hh*.45);ctx.lineTo(sx+hw*.9,sy+hh*.45);ctx.stroke();ctx.strokeStyle=muted?'#343b37':'#6f6a58';ctx.lineWidth=.7;for(let i=-.7;i<.8;i+=.22){ctx.beginPath();ctx.moveTo(sx+i*hw-2,sy+i*hh*.5+1);ctx.lineTo(sx+i*hw+2,sy+i*hh*.5-1);ctx.stroke();}}
    if(seen&&hash(seed+9)>.55){ctx.fillStyle=hash(seed+10)>.5?'#743e35':'#58605a';ctx.fillRect(sx+hw*.72,sy-2,5,2.5);ctx.fillStyle='#171c1a';ctx.fillRect(sx+hw*.73,sy-2.5,1,3.5);}
  }

  function fogCity(sx,sy,t,seed){
    if(t.terrain==='water'||t.terrain==='bridge')return;if(t.landmark){ctx.save();ctx.globalAlpha=.42;landmarkLot(sx,sy,t,seed);ctx.restore();return;}const overview=cam.worldZoom<.65;if(t.terrain==='park'||t.terrain==='forest'){const trees=overview?2:(t.terrain==='forest'?9:6);for(let i=0;i<trees;i++)cityTree(sx+(hash(seed+i*9)-.5)*28,sy+(hash(seed+i*13)-.5)*9,seed+i,true);return;}
    const count=overview?1:(t.density==='core'?5:t.density==='inner'?4:2);for(let i=0;i<count;i++){const ox=overview?0:(hash(seed+i*7)-.5)*25,oy=overview?0:(hash(seed+i*11)-.5)*6;microBuilding(sx+ox,sy+oy,overview?4.2:3.5+hash(seed+i)*3,overview?2.4:2+hash(seed+i+1)*1.5,6+hash(seed+i+2)*(t.density==='core'?25:16),'#202a26',seed+i,false);}
  }

  function landmarkLot(sx,sy,t,seed){const kind=t.landmark?.kind;if(!kind)return false;const c='#a49a7d';if(kind==='tower'){ctx.strokeStyle='#a7aaa0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,sy+2);ctx.lineTo(sx,sy-31);ctx.stroke();ctx.fillStyle='#8e9b8d';ctx.beginPath();ctx.arc(sx,sy-20,4.5,0,Math.PI*2);ctx.fill();}else if(kind==='gate'){for(let i=-2;i<=2;i++){ctx.fillStyle=c;ctx.fillRect(sx+i*4-1,sy-13,2,13);}ctx.fillRect(sx-11,sy-15,22,3);ctx.beginPath();ctx.moveTo(sx-12,sy-15);ctx.lineTo(sx,sy-20);ctx.lineTo(sx+12,sy-15);ctx.fill();}else if(kind==='dome'){microBuilding(sx,sy,10,5,13,c,seed);ctx.strokeStyle='#abb0a1';ctx.beginPath();ctx.arc(sx,sy-15,6,Math.PI,0);ctx.stroke();}else if(kind==='station'){microBuilding(sx,sy,13,5,11,'#7b8580',seed);ctx.strokeStyle='#aeb9b0';for(let i=-8;i<=8;i+=4){ctx.beginPath();ctx.arc(sx+i,sy-12,4,Math.PI,0);ctx.stroke();}}else if(kind==='airfield'){ctx.fillStyle='#5e665a';ctx.fillRect(sx-17,sy-2,34,4);ctx.strokeStyle='#c4bd96';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(sx-15,sy);ctx.lineTo(sx+15,sy);ctx.stroke();ctx.setLineDash([]);}else if(kind==='wall'){ctx.fillStyle='#847861';ctx.fillRect(sx-16,sy-9,32,7);ctx.fillStyle='#9b463e';for(let i=-13;i<14;i+=7)ctx.fillRect(sx+i,sy-8,4,2);}else{microBuilding(sx,sy,10,5,18,c,seed);}return true;}

  function cityLot(sx,sy,t,color){
    const seed=t.x*97+t.y*193,rooms=t.rooms||4;
    if(t.home){microBuilding(sx,sy-2,9,4.5,24,'#b39343',seed);microBuilding(sx-10,sy+3,6,3,11,'#736b48',seed+1);microBuilding(sx+10,sy+3,6,3,13,'#736b48',seed+2);ctx.strokeStyle='#c6a84c';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sx-19,sy+2);ctx.lineTo(sx,sy+11);ctx.lineTo(sx+19,sy+2);ctx.stroke();return;}
    if(t.terrain==='water')return;if(t.terrain==='bridge'){if(hash(seed)>.6)tank(sx+5,sy-5,2.4,7,'#596560');return;}if(t.terrain==='park'||t.terrain==='forest'){const trees=t.terrain==='forest'?10:7;for(let i=0;i<trees;i++)cityTree(sx+(hash(seed+i*9)-.5)*27,sy+(hash(seed+i*13)-.5)*9,seed+i);if(t.terrain==='forest'&&hash(seed)>.78)microBuilding(sx+4,sy,4,2,7,'#585a4d',seed);return;}if(landmarkLot(sx,sy,t,seed))return;
    const density=t.density==='core'?2:t.density==='inner'?1:0,count=Math.min(6,2+density+Math.floor(rooms/4)),spots=[[-9,-2],[4,-4],[-2,3],[10,2],[-12,4],[13,-3]];
    for(let i=0;i<count;i++){const [ox,oy]=spots[i],height=7+density*5+hash(seed+i*13)*Math.min(31,10+rooms*.8);microBuilding(sx+ox,sy+oy,4+hash(seed+i)*3,2.2+hash(seed+i+5)*1.8,height,districtColor(t,.8+hash(seed+i+8)*.22),seed+i,true);}
    ctx.fillStyle='#4d633b';for(let i=0;i<(t.density==='outer'?3:1);i++){const ox=(hash(seed+40+i)-.5)*25,oy=4+hash(seed+50+i)*4;ctx.beginPath();ctx.arc(sx+ox,sy+oy-3,2.3,0,Math.PI*2);ctx.fill();}if(hash(seed+70)>.78)tank(sx+8,sy-9,2.8,8,'#596560');
  }

  function cityInfrastructure(sx,sy,hw,hh,t){if(t.terrain==='water')return;if(t.road){const vertical=t.road==='ns'||(t.road==='ring'&&Math.abs(t.x-25.5)>Math.abs(t.y-25.5));ctx.strokeStyle=t.seen?'rgba(216,190,112,.58)':'rgba(137,132,94,.34)';ctx.lineWidth=t.road==='ring'?1.8:1.25;ctx.beginPath();if(vertical){ctx.moveTo(sx,sy-hh);ctx.lineTo(sx,sy+hh);}else{ctx.moveTo(sx-hw,sy);ctx.lineTo(sx+hw,sy);}ctx.stroke();}if(t.rail){ctx.strokeStyle=t.seen?'rgba(165,139,102,.68)':'rgba(99,94,76,.36)';ctx.lineWidth=1;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(sx-hw*.9,sy-hh*.45);ctx.lineTo(sx+hw*.9,sy+hh*.45);ctx.stroke();ctx.setLineDash([]);}}
  function citySignsOfLife(sx,sy,t,seed){if(!['urban','bridge'].includes(t.terrain))return;const smoke=hash(seed+121);if(smoke>.982){const h=10+hash(seed+122)*14;ctx.strokeStyle=t.seen?'rgba(116,122,112,.56)':'rgba(62,75,69,.38)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+5,sy-8);ctx.bezierCurveTo(sx+2,sy-h*.45,sx+9,sy-h*.72,sx+5,sy-h);ctx.stroke();ctx.fillStyle=t.seen?'rgba(126,79,43,.82)':'rgba(73,53,38,.52)';ctx.beginPath();ctx.arc(sx+5,sy-7,1.8,0,Math.PI*2);ctx.fill();}if(t.seen&&hash(seed+140)>.88){ctx.fillStyle='#a89151';ctx.fillRect(sx-1,sy+3,1.2,1.2);ctx.fillRect(sx+3,sy+1,1.2,1.2);}}

  function renderWorld(map) {
    lastCompoundState = null;
    ctx.clearRect(0, 0, W, H);
    sky();
    ctx.save();ctx.translate(W/2,H/2);ctx.rotate(cam.rot);ctx.scale(cam.worldZoom,cam.worldZoom);ctx.translate(-W/2,-H/2);
    const originX = W / 2 + cam.x/cam.worldZoom, originY = H / 2 - 20 + cam.y/cam.worldZoom;
    const hw = (TW / 2) * WS * 0.94, hh = (TH / 2) * WS * 0.94;

    worldPlacements = [];
    for (const t of [...map.tiles].sort((a, b) => (a.x + a.y) - (b.x + b.y))) {
      const [ox, oy] = isoXY(t.y - (map.world.h+1)/2, t.x - (map.world.w+1)/2);
      const sx = originX + ox * WS, sy = originY + oy * WS;
      worldPlacements.push({ t, sx, sy });
      const [screenX,screenY]=rotP(sx,sy,cam.worldZoom);
      if(screenX<-80||screenX>W+80||screenY<-90||screenY>H+90)continue;

      const seed = t.x * 97 + t.y * 193;
      cityGround(sx, sy, hw, hh, t, seed);

      if (!t.seen) {                                   // fog
        fogCity(sx, sy, t, seed);
        cityInfrastructure(sx,sy,hw,hh,t);
        citySignsOfLife(sx,sy,t,seed);
        if (t.scoutable) {                             // the frontier — click to explore
          ctx.save(); ctx.setLineDash([3, 2]);
          ctx.beginPath(); ctx.moveTo(sx,sy-hh);ctx.lineTo(sx+hw,sy);ctx.lineTo(sx,sy+hh);ctx.lineTo(sx-hw,sy);ctx.closePath();
          ctx.strokeStyle = '#d7bf55'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        }
        if(t.survivorSignal){ctx.save();ctx.fillStyle='rgba(16,27,23,.92)';ctx.strokeStyle='#7ed19a';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(sx,sy-7,8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#b9f0c9';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText('!',sx,sy-3);ctx.strokeStyle='rgba(126,209,154,.55)';ctx.beginPath();ctx.arc(sx,sy-7,12,Math.PI*1.15,Math.PI*1.85);ctx.stroke();ctx.restore();}
        continue;
      }

      const color = t.home ? '#ffd15a' : cityColor(t.name);
      cityLot(sx, sy, t, color);
      cityInfrastructure(sx,sy,hw,hh,t);
      citySignsOfLife(sx,sy,t,seed);
      if (!t.home && (t.rooms || 0) > 12) {
        ctx.fillStyle = '#9e332f'; ctx.beginPath(); ctx.arc(sx + hw * .72, sy - 4, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.restore();
    // --- screen-space pass: labels and squad markers stay upright under rotation ---
    const z = cam.worldZoom;
    ctx.textAlign='center';for(const {t,sx,sy} of worldPlacements){if(!t.districtHub)continue;const[px,py]=rotP(sx,sy,z);ctx.font='bold 14px system-ui, sans-serif';ctx.lineWidth=3;ctx.strokeStyle='rgba(4,9,8,.78)';ctx.strokeText(t.districtHub,px,py+5);ctx.fillStyle=t.seen?'rgba(226,215,177,.82)':'rgba(133,151,133,.48)';ctx.fillText(t.districtHub,px,py+5);}

    for (const { t, sx, sy } of worldPlacements) {
      if (!t.seen) continue;
      const [px, py] = rotP(sx, sy, z);
      if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;
      const label = t.home ? '★ ' + t.name : (t.landmark ? t.landmark.name : shortName(t.name));
      ctx.font = (t.home || t.landmark ? 'bold 11px ' : '10px ') + 'system-ui, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(label, px, py + 15 * z + 6);
      ctx.fillStyle = t.home ? '#fff' : (t.landmark ? '#e8cc82' : '#e8dcc4');
      ctx.fillText(label, px, py + 15 * z + 6);
      if (t.cleared && !t.home) { ctx.fillStyle='#79c96b';ctx.strokeStyle='rgba(4,12,6,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px+14,py-12*z,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#10200f';ctx.font='bold 10px system-ui';ctx.fillText('✓',px+14,py-9*z); }
      if(t.survivorSignal){ctx.fillStyle='#7ed19a';ctx.strokeStyle='rgba(5,18,10,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px-14,py-12*z,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#102319';ctx.font='bold 10px system-ui';ctx.fillText('!',px-14,py-9*z);}
    }

    for (const squad of (map.squads || (map.squad ? [map.squad] : []))) {
      const here = worldPlacements.find((p) => p.t.x === squad.x && p.t.y === squad.y);
      const target = squad.traveling ? worldPlacements.find((p) => p.t.x === squad.targetX && p.t.y === squad.targetY) : null;
      let markerX, markerY;
      if (here) [markerX, markerY] = rotP(here.sx, here.sy, z);
      if (here && target) {
        const [hx, hy] = rotP(here.sx, here.sy, z), [tx2, ty2] = rotP(target.sx, target.sy, z);
        const duration=Math.max(1,squad.arrivesAt-squad.startedAt),progress=Math.max(0,Math.min(1,(Date.now()/1000-squad.startedAt)/duration));
        markerX=hx+(tx2-hx)*progress;markerY=hy+(ty2-hy)*progress;
        const active=squad.id===map.squad?.id;ctx.strokeStyle=active?'rgba(235,205,91,.7)':'rgba(125,175,190,.55)';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(tx2,ty2);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle=active?'#d7bf55':'#7fabb5';ctx.strokeRect(tx2-7,ty2-7,14,14);
        for(let i=1;i<=3;i++){const p=Math.max(0,progress-i*.045);ctx.fillStyle=active?`rgba(215,191,85,${.42-i*.09})`:`rgba(120,175,190,${.42-i*.09})`;ctx.beginPath();ctx.arc(hx+(tx2-hx)*p,hy+(ty2-hy)*p,2,0,Math.PI*2);ctx.fill();}
      }
      if (Number.isFinite(markerX)&&Number.isFinite(markerY)) { const active=squad.id===map.squad?.id;ctx.fillStyle=active?(squad.traveling?'#ffd75a':'#eef0c6'):'#83b4bf';ctx.beginPath();ctx.arc(markerX,markerY,active?7:6,0,Math.PI*2);ctx.fill();ctx.strokeStyle=active?'#ffe07b':'#18211c';ctx.lineWidth=active?2.5:2;ctx.stroke();ctx.fillStyle='#18211c';ctx.font='bold 8px system-ui';ctx.textAlign='center';ctx.fillText((squad.name||'S')[0],markerX,markerY+3);ctx.font='9px system-ui';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.strokeText(squad.name,markerX,markerY-10);ctx.fillStyle=active?'#ffe28a':'#b8d4d7';ctx.fillText(squad.name,markerX,markerY-10); }
    }
    const seen = map.tiles.filter((t) => t.seen).length;
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(t('Berlin Exclusion Zone'), 17, TITLE_Y + 1);
    ctx.fillStyle = '#f4ead2'; ctx.fillText(t('Berlin Exclusion Zone'), 16, TITLE_Y);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#d9c9a8';
    ctx.fillText(t(`${map.squad?.name||'Squad'} selected · ${seen} places known · ${map.clearedBuildings||0} cleared (+${map.productionBonus||0}% production)`), 16, TITLE_Y + 18);
  }

  // hit-test the world map: screen px -> tile (diamond test). null if none.
  function worldPick(x, y) {
    [x, y] = unrotP(x, y, cam.worldZoom);
    const hw = (TW / 2) * WS * 0.94, hh = (TH / 2) * WS * 0.94;
    for (let i = worldPlacements.length - 1; i >= 0; i--) {
      const p = worldPlacements[i];
      if (Math.abs(x - p.sx) / hw + Math.abs(y - p.sy) / hh <= 1) return p.t;
    }
    return null;
  }

  // hit-test screen px -> facility (front-most first). null if empty space.
  function pick(x, y) {
    [x, y] = unrotP(x, y, cam.zoom);
    for (let i = placements.length - 1; i >= 0; i--) {
      const p = placements[i];
      const hw = (TW / 2) * INSET, hh = (TH / 2) * INSET, h = hOf(p.level);
      if (x >= p.sx - hw && x <= p.sx + hw && y >= p.sy - h - hh && y <= p.sy + hh) return p;
    }
    for(let i=emptyPlacements.length-1;i>=0;i--){const p=emptyPlacements[i],hw=TW/2,hh=TH/2;if(Math.abs(x-p.sx)/hw+Math.abs(y-p.sy)/hh<=1)return p;}
    return null;
  }
  // Facility and empty-plot selection are mutually exclusive.
  function setSelected(slot) { selected = slot; if (slot != null) selectedCell = null; }
  function setSelectedCell(gx, gy) { selectedCell = (gx == null ? null : { gx, gy }); if (selectedCell) selected = null; }

  function setZoom(value){cam.zoom=Math.max(.55,Math.min(4,value));}
  function setWorldZoom(value){cam.worldZoom=Math.max(.42,Math.min(2.2,value));}
  function setRotation(rad){cam.rot=rad%(Math.PI*2);}
  // center the compound camera on a grid cell (facility-list jump)
  function centerCompoundOn(gridX, gridY) {
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let r=0;r<gridDims.h;r++)for(let c=0;c<gridDims.w;c++){const[ox,oy]=isoXY(r,c);if(ox<minX)minX=ox;if(ox>maxX)maxX=ox;if(oy<minY)minY=oy;if(oy>maxY)maxY=oy;}
    const [ox,oy]=isoXY(gridY,gridX);
    cam.x=(minX+maxX)/2-ox;
    cam.y=(minY+maxY)/2-oy+30;
  }
  // Sprites decode after the first paint, so redraw the compound as they arrive.
  onSpritesChanged(() => { if (lastCompoundState) render(lastCompoundState); });

  return { render, renderWorld, resize, cam, pick, worldPick, setSelected, setSelectedCell, setZoom, setWorldZoom, setRotation, centerCompoundOn, startRaidAnimation };
}
