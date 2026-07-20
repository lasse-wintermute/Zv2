import { makeDraggable } from './draggable.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createTutorial(el,opts={}){
 const onAdvance=opts.onAdvance||(()=>{}),onDismiss=opts.onDismiss||(()=>{}),onRestart=opts.onRestart||(()=>{});
 const dragger=makeDraggable(el,{handle:'.tutorial-card header',target:'.tutorial-card',storageKey:'zv2.window.tutorial'});
 let data=null,open=false;
 el.addEventListener('click',e=>{const b=e.target.closest('[data-tutorial-action]');if(!b||b.disabled)return;const action=b.dataset.tutorialAction;if(action==='close'){hide();return;}b.disabled=true;if(action==='advance')onAdvance();if(action==='dismiss')onDismiss();if(action==='restart')onRestart();});
 function clearFocus(){document.querySelectorAll('.tutorial-focus').forEach(n=>n.classList.remove('tutorial-focus'));}
 function focus(target){dragger.restore();clearFocus();const selector=target==='hud'?'#hud':target==='world'?'#hdr-map':target==='squads'?'#hdr-squads':target==='research'?'#hdr-records':target==='toolshop'?'#hdr-records':target==='compound'?'#game':'';if(selector)document.querySelector(selector)?.classList.add('tutorial-focus');}
 function show(d){data=d;open=true;const c=d.content||{};const finished=d.complete;el.innerHTML=`<aside class="tutorial-card"><header><div><small>FIELD MANUAL · ${Math.min(d.step+1,d.total)}/${d.total}</small><h2>${esc(c.title||'Tutorial')}</h2></div><button data-tutorial-action="close" aria-label="Hide tutorial">−</button></header><p>${esc(c.body||'')}</p><div class="tutorial-objective"><small>OBJECTIVE</small><b>${esc(c.objective||'')}</b></div><div class="tutorial-actions">${finished?'<button data-tutorial-action="restart">Restart tutorial</button>':`<button class="tutorial-skip" data-tutorial-action="dismiss">Skip</button><button class="tutorial-next" data-tutorial-action="advance"${d.ready?'':' disabled'}>${d.ready?'Continue':'Objective pending…'}</button>`}</div></aside>`;el.classList.add('open');focus(c.target);}
 function hide(){open=false;el.classList.remove('open');clearFocus();}
 function update(d){data=d;if(d.active||d.complete)show(d);else hide();}
 function reopen(){if(data&&(data.active||data.complete))show(data);else onRestart();}
 function isOpen(){return open;}
 function currentStep(){return data?.step??-1;}
 return{show:update,hide,reopen,isOpen,currentStep};
}
