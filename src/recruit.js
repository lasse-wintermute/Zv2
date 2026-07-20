const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createRecruitEncounter({onAction=async()=>({}),onOpenReserve=()=>{},onClose=()=>{}}={}){
  let openId=0,dismissedId=0;
  const requestLine=(r)=>{
    const item=r.requiredItem?.name||'a useful supply';
    if(r.requiredItem?.category==='medicine')return `I am not leaving without ${item}. Bring me some and I will join you.`;
    if(r.requiredItem?.category==='ammo')return `I can fight, but not with an empty weapon. Bring me ${item} and we have a deal.`;
    if(r.requiredItem?.category==='fuel')return `I have unfinished business before I leave. One ${item} will settle it.`;
    if(r.requiredItem?.category==='technology')return `I need ${item} from the ruins. Find it, and my skills are yours.`;
    return `Supplies first. Bring me ${item}, and I will come back to your stronghold.`;
  };
  function show(recruit){
    if(!recruit||openId===recruit.id||dismissedId===recruit.id)return;
    openId=recruit.id;
    const overlay=document.createElement('div');overlay.className='recruit-overlay';
    const render=(hint='',joined=false)=>{
      const item=recruit.requiredItem||{};
      overlay.innerHTML=`<article class="recruit-card" role="dialog" aria-modal="true" aria-label="Survivor encounter"><div class="recruit-portrait" aria-hidden="true">${esc(recruit.name.charAt(0))}</div><div class="recruit-copy"><small>${joined?'NEW RECRUIT':'SURVIVOR ENCOUNTER'} · ${recruit.x}|${recruit.y}</small><h2>${esc(recruit.name)}</h2><p>“${esc(joined?'You kept your word. I will keep mine. Lead the way back to the stronghold.':requestLine(recruit))}”</p>${hint?`<div class="recruit-hint"><b>INFORMATION</b>${esc(hint)}</div>`:''}<div class="recruit-stats"><span>ATK <b>${recruit.attack}</b></span><span>DEF <b>${recruit.defense}</b></span>${joined?'<strong>Joined Stronghold reserve</strong>':`<strong>WANTS: ${esc(item.name||'Unknown item')} · squad carries ${item.carried||0}</strong>`}</div><div class="recruit-actions">${joined?'<button data-recruit-close>Welcome aboard</button><button class="primary" data-recruit-reserve>Open reserve</button>':`<button data-recruit-close>Leave</button><button data-recruit-info>Give me information</button><button class="primary" data-recruit-give${recruit.canRecruit?'':' disabled'}>Give ${esc(item.name||'item')}</button>`}</div></div></article>`;
    };
    render();document.body.appendChild(overlay);
    const close=()=>{dismissedId=recruit.id;openId=0;overlay.remove();onClose();};
    overlay.addEventListener('click',async(e)=>{
      if(e.target===overlay||e.target.closest('[data-recruit-close]')){close();return;}
      if(e.target.closest('[data-recruit-reserve]')){close();onOpenReserve();return;}
      const info=e.target.closest('[data-recruit-info]');if(info){info.disabled=true;try{const r=await onAction('info',recruit.id);render(r.hint||'No useful lead.');}catch(err){render(err.message||'No useful lead.');}return;}
      const give=e.target.closest('[data-recruit-give]');if(give&&!give.disabled){give.disabled=true;try{await onAction('recruit',recruit.id);render('',true);}catch(err){render(err.message||'The exchange failed.');}}
    });
    overlay.querySelector('[data-recruit-close]')?.focus();
  }
  function reset(id=0){if(!id||dismissedId===id)dismissedId=0;}
  return{show,reset};
}
