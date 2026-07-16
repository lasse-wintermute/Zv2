import { makeDraggable } from './draggable.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createInventory(el,opts={}){
 const onClose=opts.onClose||(()=>{}),onAction=opts.onAction||(()=>{}),onCraft=opts.onCraft||(()=>{});
 const dragger=makeDraggable(el,{handle:'.inventory-card header',target:'.inventory-card',storageKey:'zv2.window.inventory'});
 el.addEventListener('click',e=>{if(e.target.closest('[data-inv-close]')){hide();onClose();return;}const craft=e.target.closest('[data-craft]');if(craft&&!craft.disabled){craft.disabled=true;onCraft(Number(craft.dataset.craft));return;}const b=e.target.closest('[data-inv-act]');if(b&&!b.disabled){b.disabled=true;onAction(b.dataset.invAct,Number(b.dataset.survivor),Number(b.dataset.item||0));}});
 function hide(){el.classList.remove('open');el.innerHTML='';}
 function show(data){
  const survivors=data.survivors||[],items=data.items||[],recipes=data.recipes||[];
  const weapons=items.filter(i=>i.category==='weapon'),usable=items.filter(i=>i.healing>0),repairKits=items.filter(i=>i.repairAmount>0);
  const squad=survivors.map(s=>{
   const condition=s.weaponId&&s.maxDurability?`${s.durability}/${s.maxDurability} condition`:'';
   const ammo=s.ammoItem?`${s.ammo} rounds`:'';
   const ready=!s.weaponId||(s.durability>0&&(!s.ammoItem||s.ammo>0));
   const seconds=s.treatment?Math.max(0,s.treatment.due-Math.floor(Date.now()/1000)):0;
   const duty=s.treatment?`Hospital · Lv ${s.treatment.soldierLevel} · ${seconds}s remaining`:(s.job?`Working: ${s.job}`:(s.fatigue>=90?'Exhausted — must rest':'Available for expeditions'));
   return `<article class="survivor-card ${s.hp<=0?'down':''} ${s.treatment?'in-treatment':''}"><div class="survivor-top"><b>${esc(s.name)} · Lv ${s.level}</b><span>${s.hp}/${s.maxHp} HP</span></div><div class="health"><i style="width:${Math.max(0,s.hp/s.maxHp*100)}%"></i></div><div class="survivor-stats">ATK ${s.attack+(ready?s.weaponBonus:0)} · DEF ${s.defense} · ${esc(s.weapon||'unarmed')}</div><div class="duty-state ${s.available?'available':'busy'}">${esc(duty)} · ${s.fatigue}% fatigue</div>${condition||ammo?`<div class="weapon-state ${ready?'':'warning'}">${[condition,ammo].filter(Boolean).join(' · ')}</div>`:''}<div class="equip-actions">${s.weaponId?`<button data-inv-act="unequip" data-survivor="${s.id}"${s.treatment?' disabled':''}>Unequip</button>`:''}${weapons.map(w=>`<button data-inv-act="equip" data-survivor="${s.id}" data-item="${w.id}"${s.weaponId===w.id||s.treatment||w.available<1?' disabled':''}>${esc(w.name)} +${w.attackBonus}</button>`).join('')}${usable.map(i=>`<button class="heal-btn" data-inv-act="use" data-survivor="${s.id}" data-item="${i.id}"${s.hp>=s.maxHp||s.treatment?' disabled':''}>Use ${esc(i.name)} +${i.healing}</button>`).join('')}${repairKits.map(i=>`<button class="repair-btn" data-inv-act="repair" data-survivor="${s.id}" data-item="${i.id}"${!s.weaponId||s.durability>=s.maxDurability||s.treatment?' disabled':''}>Repair +${i.repairAmount}</button>`).join('')}</div></article>`;
  }).join('');
  const stash=items.length?items.map(i=>{
   const reserved=[];if(i.assignedToSquads)reserved.push(`${i.assignedToSquads} with squads`);if(i.equippedBySurvivors)reserved.push(`${i.equippedBySurvivors} personal`);
   return `<li><span><b>${esc(i.name)}</b><small>${esc(i.category)}${i.attackBonus?` · +${i.attackBonus} ATK`:''}${i.defenseBonus?` · +${i.defenseBonus} DEF`:''}${i.healing?` · heals ${i.healing}`:''}${i.maxDurability?` · ${i.durability}/${i.maxDurability} condition`:''}${reserved.length?` · ${reserved.join(', ')}`:''}</small></span><strong>${i.available}/${i.amount} free</strong></li>`;
  }).join(''):'<li class="empty">The stash is empty.</li>';
  const crafting=recipes.length?recipes.map(r=>`<article class="recipe ${r.canCraft?'ready':''}"><div><b>${esc(r.name)}</b><small>Makes ${r.result.amount}× ${esc(r.result.name)} · Toolshop L${r.toolshopLevel||1}</small></div><ul>${r.ingredients.map(i=>`<li class="${i.owned<i.amount?'missing':''}">${esc(i.name)} <span>${i.owned}/${i.amount}</span></li>`).join('')}</ul><button data-craft="${r.id}"${r.canCraft?'':' disabled'}>${r.canCraft?'Produce':esc(r.reason||'Unavailable')}</button></article>`).join(''):'<p class="empty">No production plans known.</p>';
  el.innerHTML=`<div class="inventory-card"><header title="Drag to move"><div><small>STRONGHOLD WORKSHOP</small><h2>Squad, Stash & Production</h2></div><button data-inv-close aria-label="Close">✕</button></header><div class="inventory-grid"><section><h3>Survivors</h3><div class="squad-list">${squad}</div></section><section><h3>Stash</h3><ul class="stash-list">${stash}</ul></section><section><h3>Toolshop production</h3><div class="recipe-list">${crafting}</div></section></div></div>`;
  el.classList.add('open');dragger.restore();
 }
 return{show,hide};
}
