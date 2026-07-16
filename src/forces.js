import { makeDraggable } from './draggable.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bonus=i=>[i.attackBonus?`+${i.attackBonus} ATK`:'',i.defenseBonus?`+${i.defenseBonus} DEF`:''].filter(Boolean).join(' · ');

export function createForces(el,opts={}){
 const dragger=makeDraggable(el,{handle:'.forces-card header',target:'.forces-card',storageKey:'zv2.window.forces'});
 let data=null;const act=opts.onAction||(()=>{}),select=opts.onSelect||(()=>{}),equipment=opts.onEquipment||(()=>{});
 el.addEventListener('click',e=>{
  if(e.target.closest('[data-forces-close]'))return hide();
  if(e.target.closest('[data-open-equipment]'))return equipment();
  const b=e.target.closest('[data-force-action]');
  if(b&&!b.disabled){b.disabled=true;act(b.dataset.forceAction,Number(b.dataset.survivor||0),Number(b.dataset.squad||0),b.dataset.focus||'',Number(b.dataset.item||0));}
  const s=e.target.closest('[data-select-squad]');if(s){select(Number(s.dataset.selectSquad));show(data);}
 });
 function hide(){el.classList.remove('open');el.innerHTML='';}
 function isOpen(){return el.classList.contains('open');}
 function show(d,active=0){
  data=d;const home=d.home||{},catalog=d.equipmentCatalog||[];
  const bySquad=new Map((d.squads||[]).map(s=>[s.id,(d.survivors||[]).filter(v=>v.squadId===s.id)]));
  const squads=(d.squads||[]).map(s=>{
   const members=bySquad.get(s.id)||[],atHome=!s.traveling&&s.x===home.x&&s.y===home.y;
   const cargo=s.cargo||{items:[],used:0,capacity:members.length*8},hasLoot=cargo.items.length>0;
   const canDeposit=atHome&&hasLoot&&d.storage?.acceptsLoot;
   const depositLabel=!atHome?'Return first':!hasLoot?'No loot':!d.storage?.acceptsLoot?'Storage required':'Deposit loot';
   const cargoHint=!hasLoot?'Empty':!d.storage?.acceptsLoot?'Build Storage to deposit loot':atHome?'Ready to deposit in Storage':'Return home to deposit';
   const ready=members.filter(v=>v.hp>0&&v.fatigue<90&&!v.job).length;
   const gear=s.equipment||{items:[],attackBonus:0,defenseBonus:0,slots:{weapons:{used:0,capacity:members.length},defense:{used:0,capacity:Math.ceil(members.length/2)}},stats:{attack:0,defense:0,baseAttack:0,baseDefense:0}};
   const equipped=gear.items?.length?gear.items.map(i=>`<div class="gear-row equipped"><span><b>${esc(i.name)} ×${i.amount}</b><small>${bonus(i)}</small></span><button data-force-action="unequip" data-squad="${s.id}" data-item="${i.id}"${atHome?'':' disabled'}>Return</button></div>`).join(''):'<p class="force-empty">No squad gear issued.</p>';
   const storageGear=catalog.length?catalog.map(i=>{
    const slots=i.slot==='weapon'?gear.slots.weapons:gear.slots.defense;
    const disabled=!d.storage?.acceptsLoot||!atHome||!members.length||i.available<1||slots.used>=slots.capacity;
    const reason=!d.storage?.acceptsLoot?'Build Storage':!atHome?'Return home':!members.length?'Assign crew':i.available<1?'All copies assigned':slots.used>=slots.capacity?'Slots full':'Equip';
    return `<div class="gear-row"><span><b>${esc(i.name)}</b><small>${bonus(i)} · ${i.available}/${i.owned} free</small></span><button data-force-action="equip" data-squad="${s.id}" data-item="${i.id}"${disabled?' disabled':''}>${reason}</button></div>`;
   }).join(''):'<p class="force-empty">No weapons or defense items in Storage.</p>';
   return `<article class="force-squad ${s.id===active?'selected':''}">
    <div class="force-squad-title"><div><b>${esc(s.name)}</b><small>${s.traveling?`en route to ${s.targetX}|${s.targetY}`:`at ${s.x}|${s.y}`} · ${ready}/${members.length} ready</small></div><div class="force-command-buttons"><button data-select-squad="${s.id}">${s.id===active?'Selected':'Deploy'}</button><button class="return-home" data-force-action="return" data-squad="${s.id}"${atHome||s.traveling||!members.length?' disabled':''}>${atHome?'At home':s.traveling?'Traveling…':'Return home'}</button><button class="deposit-loot" data-force-action="deposit" data-squad="${s.id}"${canDeposit?'':' disabled'}>${depositLabel}</button></div></div>
    <div class="force-readiness"><span>Cargo ${cargo.used}/${cargo.capacity} kg</span><i><em style="width:${cargo.capacity?Math.min(100,cargo.used/cargo.capacity*100):0}%"></em></i><small>${hasLoot?`${cargo.items.map(i=>`${esc(i.name)} ×${i.amount}`).join(' · ')} · ${cargoHint}`:cargoHint}</small></div>
    ${members.length?members.map(v=>`<div class="force-person"><span><b>${esc(v.name)}</b><small>ATK ${v.attack} · DEF ${v.defense} · ${esc(v.weapon||'unarmed')}</small></span><button data-force-action="remove" data-survivor="${v.id}" data-squad="${s.id}"${atHome?'':' disabled'}>Reserve</button></div>`).join(''):'<p class="force-empty">No one assigned.</p>'}
    <section class="squad-loadout"><div class="loadout-title"><b>Squad loadout</b><span>ATK ${gear.stats.attack} <em>+${gear.attackBonus}</em> · DEF ${gear.stats.defense} <em>+${gear.defenseBonus}</em></span></div><div class="gear-slots"><span>Weapons ${gear.slots.weapons.used}/${gear.slots.weapons.capacity}</span><span>Defense ${gear.slots.defense.used}/${gear.slots.defense.capacity}</span></div><div class="equipped-gear">${equipped}</div><div class="loadout-storage-title">Issue gear from Storage</div><div class="storage-gear">${storageGear}</div></section>
   </article>`;
  }).join('');
  const reserve=(d.survivors||[]).filter(v=>!v.squadId);
  const reserveRows=reserve.map(v=>`<article class="reserve-person ${v.treatment?'in-treatment':''}"><div><b>${esc(v.name)} <small>Lv ${v.level}</small></b><small>ATK ${v.attack} · DEF ${v.defense} · ${esc(v.weapon||'unarmed')}${v.job?' · facility duty':''}</small>${v.treatment?`<em class="hospital-state">Hospital treatment · <span data-treatment-due="${v.treatment.due}"></span> · Hospital Lv ${v.treatment.hospitalLevel}</em>`:(v.training?`<em>${esc(v.training.focus)} training · <span data-training-due="${v.training.due}"></span></em>`:'')}</div><div class="reserve-actions">${(d.squads||[]).map(s=>`<button data-force-action="assign" data-survivor="${v.id}" data-squad="${s.id}"${v.job||v.training||v.treatment||v.hp<=0||s.traveling||s.x!==home.x||s.y!==home.y?' disabled':''}>Join ${esc(s.name)}</button>`).join('')}${d.quarters.level?`<button data-force-action="train" data-survivor="${v.id}" data-focus="attack"${v.job||v.training||v.treatment||v.hp<=0?' disabled':''}>Train ATK</button><button data-force-action="train" data-survivor="${v.id}" data-focus="defense"${v.job||v.training||v.treatment||v.hp<=0?' disabled':''}>Train DEF</button>`:''}</div></article>`).join('')||'<p class="force-empty">No survivors in reserve.</p>';
  el.innerHTML=`<div class="forces-card"><header title="Drag to move"><div><small>SURVIVOR COMMAND</small><h2>Squads & Troop Quarters</h2></div><button data-forces-close>✕</button></header><div class="forces-summary"><span>Troop Quarters <b>Level ${d.quarters.level}</b></span><span>Squads <b>${d.squads.length}/${d.quarters.squadLimit}</b></span><span>Training slots <b>${(d.survivors||[]).filter(v=>v.training).length}/${d.quarters.trainingCapacity}</b></span><span>Recruits found <b>${d.recruits.found}/${d.recruits.total}</b></span></div>${d.quarters.level?'<p class="recruit-intel">Named survivors are hiding throughout unexplored city blocks. Reach their location and they will join your reserve.</p>':'<p class="forces-warning">Build Troop Quarters to form more squads and train reserve survivors.</p>'}<div class="forces-body"><section><div class="forces-heading"><h3>Active squads</h3><button data-force-action="create"${d.squads.length>=d.quarters.squadLimit?' disabled':''}>+ Form squad</button></div>${squads}</section><section><h3>Stronghold reserve</h3>${reserveRows}</section></div></div>`;
  el.classList.add('open');dragger.restore();tick();
 }
 function tick(){el.querySelectorAll('[data-training-due]').forEach(n=>{const s=Math.max(0,Number(n.dataset.trainingDue)-Math.floor(Date.now()/1000));n.textContent=s?`${s}s remaining`:'finishing…';});el.querySelectorAll('[data-treatment-due]').forEach(n=>{const s=Math.max(0,Number(n.dataset.treatmentDue)-Math.floor(Date.now()/1000));n.textContent=s?`${s}s remaining`:'discharge pending…';});}
 setInterval(tick,1000);return{show,hide,isOpen};
}
