<?php
require __DIR__ . '/_bootstrap.php'; global $db;
$uid=api_require_user(); $slot=(int)($_GET['slot']??0); if($slot<1||$slot>45)json_err('bad_slot','slot must be 1..45');
zv2_refresh($uid);
$r=$db->query('SELECT buildings,ressis,activebuildings,location FROM strongholds WHERE userid='.$uid.' LIMIT 1');if(!$r||!$r->num_rows)json_err('no_stronghold','Stronghold not found.',404);
$hold=$r->fetch_assoc();$levels=pipe_nums($hold['buildings']);$ownedRes=pipe_nums($hold['ressis']);$level=(int)($levels[$slot]??0);$building=null;$activeBuilds=zv2_active_builds($uid);
[$homeX,$homeY]=array_map('intval',explode('|',(string)$hold['location']));
$activityMap=zv2_activity((string)$hold['activebuildings']);$activity=(int)round(($activityMap[$slot]??1.0)*100);
foreach($activeBuilds as$b)if($b['slot']===$slot){$building=['due'=>$b['due'],'toLevel'=>$b['toLevel']];break;}
$fr=$db->query('SELECT name,description,maxlevel FROM facilities WHERE id='.$slot.' LIMIT 1');
$fac=($fr&&$fr->num_rows)?$fr->fetch_assoc():['name'=>'Facility '.$slot,'description'=>'Not yet available.','maxlevel'=>0];
$max=(int)$fac['maxlevel'];$atMax=$max===0||$level>=$max;$next=$level+1;$cost=[];
if(!$atMax){$cr=$db->query("SELECT water,food,wood,metal,petrol FROM facility_costs WHERE facility_id=$slot AND level=$next LIMIT 1");if($cr&&$cr->num_rows){$c=$cr->fetch_assoc();foreach(['water','food','wood','metal','petrol']as$i=>$key)if((int)$c[$key]>0)$cost[]=['res'=>$key,'amount'=>(int)$c[$key],'owned'=>(int)floor($ownedRes[$i]??0),'enough'=>($ownedRes[$i]??0)>=(int)$c[$key]];}}
$canAfford=!array_filter($cost,fn($c)=>!$c['enough']);$canUpgrade=!$atMax&&!$activeBuilds&&$canAfford;$upgradeReason=$atMax?'Maximum level reached.':($activeBuilds?'Another construction project is active.':(!$canAfford?'Missing resources.':''));
// OG: job cap = level × 10 × activity (Zv2 scale: level, throttled by activity)
$capacity=max(0,(int)floor(min(6,max(1,$level))*($activityMap[$slot]??1.0)));
$now=time();$staff=[];$sq=$db->query("SELECT s.id,s.name,s.hp,s.max_hp,s.fatigue,s.attack_stat,s.defense_stat,s.job_facility,f.name job_name,ht.due treatment_due,q.name squad_name,q.x squad_x,q.y squad_y,q.target_x squad_target_x,q.target_y squad_target_y,q.arrives_at squad_arrives FROM survivors s LEFT JOIN facilities f ON f.id=s.job_facility LEFT JOIN hospital_treatments ht ON ht.survivor_id=s.id LEFT JOIN squad_members sm ON sm.survivor_id=s.id LEFT JOIN squads q ON q.id=sm.squad_id WHERE s.userid=$uid ORDER BY s.id");
while($sq&&($sv=$sq->fetch_assoc())){
 $traveling=$sv['squad_arrives']!==null&&(int)$sv['squad_arrives']>$now;
 $arrivedAtTarget=$sv['squad_arrives']!==null&&(int)$sv['squad_arrives']>0&&(int)$sv['squad_arrives']<=$now&&$sv['squad_target_x']!==null;
 $squadX=$arrivedAtTarget?(int)$sv['squad_target_x']:(int)$sv['squad_x'];$squadY=$arrivedAtTarget?(int)$sv['squad_target_y']:(int)$sv['squad_y'];
 $squadAway=$sv['squad_name']!==null&&($traveling||$squadX!==$homeX||$squadY!==$homeY);
 $available=(int)$sv['hp']>0&&(float)$sv['fatigue']<90&&$sv['treatment_due']===null&&!$squadAway;
 // OG rule: disabled things say WHY.
 $reason=(int)$sv['hp']<=0?'incapacitated — needs the Hospital':((float)$sv['fatigue']>=90?'too exhausted — needs rest':($sv['treatment_due']!==null?'in Hospital treatment':($squadAway?'outside the compound with squad '.$sv['squad_name']:null)));
 $staff[]=['id'=>(int)$sv['id'],'name'=>$sv['name'],'hp'=>(int)$sv['hp'],'maxHp'=>(int)$sv['max_hp'],'fatigue'=>round((float)$sv['fatigue']),'attack'=>(int)$sv['attack_stat'],'defense'=>(int)$sv['defense_stat'],'jobFacility'=>$sv['job_facility']===null?null:(int)$sv['job_facility'],'job'=>$sv['job_name'],'squad'=>$sv['squad_name'],'squadTraveling'=>$traveling,'squadAway'=>$squadAway,'treatment'=>$sv['treatment_due']===null?null:['due'=>(int)$sv['treatment_due']],'available'=>$available,'unavailableReason'=>$reason];
}
$patients=[];if($slot===16){$pq=$db->query("SELECT ht.survivor_id id,s.name,ht.started_at,ht.due,ht.soldier_level,ht.hospital_level FROM hospital_treatments ht JOIN survivors s ON s.id=ht.survivor_id WHERE ht.userid=$uid ORDER BY ht.due");while($pq&&($p=$pq->fetch_assoc()))$patients[]=['id'=>(int)$p['id'],'name'=>$p['name'],'startedAt'=>(int)$p['started_at'],'due'=>(int)$p['due'],'soldierLevel'=>(int)$p['soldier_level'],'hospitalLevel'=>(int)$p['hospital_level']];}
// --- facility-specific content, mirroring each OG facility page ---
$extra=[];
if($slot===3){   // Garage: the vehicle yard (OG garage.php vehiclesinstronghold)
    $vehicles=[];$vr=$db->query("SELECT v.id,v.name,v.fuel,v.seats_upgrade,v.cargo_upgrade,v.assigned_squad,t.name type_name,t.seats,t.cargo_bonus,t.speed_bonus,t.fuel_capacity,t.fuel_per_tile,q.name squad_name FROM vehicles v JOIN vehicle_types t ON t.id=v.type_id LEFT JOIN squads q ON q.id=v.assigned_squad WHERE v.userid=$uid ORDER BY v.id");
    while($vr&&($v=$vr->fetch_assoc()))$vehicles[]=['id'=>(int)$v['id'],'name'=>$v['name'],'type'=>$v['type_name'],'fuel'=>(int)$v['fuel'],'fuelCapacity'=>(int)$v['fuel_capacity'],'fuelPerTile'=>(int)$v['fuel_per_tile'],'seats'=>(int)$v['seats']+(int)$v['seats_upgrade'],'cargoBonus'=>(int)$v['cargo_bonus']+(int)$v['cargo_upgrade']*10,'speedBonus'=>(int)$v['speed_bonus'],'squad'=>$v['squad_name'],'assigned'=>$v['assigned_squad']!==null];
    $types=[];$tr=$db->query("SELECT id,name,description,garage_level,seats,cargo_bonus,speed_bonus,fuel_capacity,fuel_per_tile,metal_cost,wood_cost FROM vehicle_types ORDER BY garage_level,id");
    while($tr&&($t=$tr->fetch_assoc()))$types[]=['id'=>(int)$t['id'],'name'=>$t['name'],'description'=>$t['description'],'garageLevel'=>(int)$t['garage_level'],'seats'=>(int)$t['seats'],'cargoBonus'=>(int)$t['cargo_bonus'],'speedBonus'=>(int)$t['speed_bonus'],'fuelCapacity'=>(int)$t['fuel_capacity'],'fuelPerTile'=>(int)$t['fuel_per_tile'],'metalCost'=>(int)$t['metal_cost'],'woodCost'=>(int)$t['wood_cost'],'unlocked'=>$level>=(int)$t['garage_level']];
    // OG garage.php: vehicle capacity = floor(level / 2), minimum 1
    $extra['garage']=['vehicles'=>$vehicles,'types'=>$types,'capacity'=>max(1,(int)floor($level/2)),'petrol'=>(int)floor($ownedRes[4]??0)];
}
if($slot===4){   // Storage: the stash browser (OG storage.php item tabs)
    $stock=[];$sr=$db->query("SELECT v.item_id,v.amount,v.durability,i.name,i.category,i.attack_bonus,i.defense_bonus,i.healing,i.max_durability FROM inventory v JOIN items i ON i.id=v.item_id WHERE v.userid=$uid AND v.amount>0 ORDER BY i.category,i.name");
    while($sr&&($it=$sr->fetch_assoc()))$stock[]=['id'=>(int)$it['item_id'],'name'=>$it['name'],'category'=>$it['category'],'amount'=>(int)$it['amount'],'durability'=>$it['durability']===null?null:(int)$it['durability'],'maxDurability'=>(int)$it['max_durability'],'attackBonus'=>(int)$it['attack_bonus'],'defenseBonus'=>(int)$it['defense_bonus'],'healing'=>(int)$it['healing'],'weight'=>zv2_item_weight((int)$it['item_id'])];
    $caps=zv2_storage_caps($levels);$resKeys=['water','food','wood','metal','petrol'];$res=[];
    foreach($resKeys as$i=>$k)$res[]=['res'=>$k,'amount'=>round($ownedRes[$i]??0,1),'cap'=>$caps[$i]>=1000000000.0?null:(int)$caps[$i]];
    $extra['storage']=['stock'=>$stock,'resources'=>$res,'scavengerCap'=>$level*10];
}
if($slot===8){   // Fortifications: installed defences (OG fortifications.php installdefense)
    $def=[];$dr=$db->query("SELECT v.item_id,v.amount,i.name,i.defense_bonus FROM inventory v JOIN items i ON i.id=v.item_id WHERE v.userid=$uid AND i.defense_bonus>0 AND v.amount>0 ORDER BY i.defense_bonus DESC");
    while($dr&&($d=$dr->fetch_assoc()))$def[]=['id'=>(int)$d['item_id'],'name'=>$d['name'],'amount'=>(int)$d['amount'],'defenseBonus'=>(int)$d['defense_bonus'],'total'=>(int)$d['amount']*(int)$d['defense_bonus']];
    $eff=zv2_staff_effects($uid,$levels,$activityMap);
    $extra['defense']=['items'=>$def,'wallBonus'=>$level*4,'total'=>(int)$eff['defense'],'installCap'=>$level];
}
$effects=[1=>'Boosts water and food production by 25% per worker.',2=>'Boosts wood and metal production.',3=>'Boosts fuel production.',8=>'Adds survivor combat skill to raid defence.',9=>'Adds 3 power generation per worker.',10=>'Unlocks additional squads and training slots for reserve survivors.',11=>'Technicians reduce Toolshop production time by 15% each.',12=>'Scientists generate research points.',16=>'Treats critical patients; higher levels and assigned doctors reduce recovery time.',17=>'Coordinates stronghold defence.'];
$upgradeBenefits=[];
if(!$atMax){
    $activityFactor=$activityMap[$slot]??1.0;
    $nextCapacity=max(0,(int)floor(min(6,max(1,$next))*$activityFactor));
    if($nextCapacity>$capacity)$upgradeBenefits[]='Staff capacity: '.$capacity.' → '.$nextCapacity;
    $currentDrain=zv2_facility_drain($slot,$level,$activityFactor);$nextDrain=zv2_facility_drain($slot,$next,$activityFactor);
    if($nextDrain!==$currentDrain)$upgradeBenefits[]='Power draw: '.$currentDrain.' → '.$nextDrain;
    if($slot===1)$upgradeBenefits[]='Base water & food output: +'.($level*15).'% → +'.($next*15).'%';
    if($slot===2)$upgradeBenefits[]='Base wood & metal output: +'.($level*20).'% → +'.($next*20).'%';
    if($slot===3){$upgradeBenefits[]='Base petrol output: +'.($level*20).'% → +'.($next*20).'%';$oldGarage=max(1,(int)floor($level/2));$newGarage=max(1,(int)floor($next/2));if($newGarage>$oldGarage)$upgradeBenefits[]='Vehicle capacity: '.$oldGarage.' → '.$newGarage;}
    if($slot===4){$cap=fn(int$lvl):int=>(int)max(100,pow(max(1,$lvl),2.5)*100);$upgradeBenefits[]='Resource storage caps: '.$cap($level).' → '.$cap($next);$upgradeBenefits[]='Scavenger capacity: '.($level*10).' → '.($next*10);}
    if($slot===8)$upgradeBenefits[]='Wall defence: +'.($level*4).' → +'.($next*4);
    if($slot===9){$curve=[15,40,80,145,250,420,695,1140,1880,3065];$upgradeBenefits[]='Generator output: '.($level>0?$curve[min(9,$level-1)]:0).' → '.$curve[min(9,$next-1)];}
    if($slot===10){$oldSquads=min(5,1+$level);$newSquads=min(5,1+$next);if($newSquads>$oldSquads)$upgradeBenefits[]='Squad limit: '.$oldSquads.' → '.$newSquads;$oldTraining=$level?min(3,max(1,(int)ceil($level/2))):0;$newTraining=min(3,max(1,(int)ceil($next/2)));if($newTraining>$oldTraining)$upgradeBenefits[]='Training slots: '.$oldTraining.' → '.$newTraining;$upgradeBenefits[]='Training time: '.max(15,45-$level*5).'s → '.max(15,45-$next*5).'s';}
    if($slot===11)$upgradeBenefits[]='Toolshop level speed bonus: +'.(max(0,$level-1)*5).'% → +'.(max(0,$next-1)*5).'%';
    if($slot===12)$upgradeBenefits[]='Base research generation: '.(2+$level*2).' → '.(2+$next*2).' RP/hour';
    if($slot===16)$upgradeBenefits[]='Hospital level treatment speed: +'.(max(0,$level-1)*30).'% → +'.(max(0,$next-1)*30).'%';
    $unlocks=[];$uq=$db->query("SELECT name FROM technologies WHERE req_facility=$slot AND req_level=$next ORDER BY branch,tier");while($uq&&($u=$uq->fetch_assoc()))$unlocks[]=$u['name'];
    if($slot===11){$rq=$db->query("SELECT name FROM recipes WHERE toolshop_level=$next ORDER BY name");while($rq&&($u=$rq->fetch_assoc()))$unlocks[]=$u['name'];}
    if($unlocks)$upgradeBenefits[]='Unlocks: '.implode(', ',array_unique($unlocks));
    if(!$upgradeBenefits)$upgradeBenefits[]='Improves '.$fac['name'].' efficiency and progression requirements.';
}
json_out(['ok'=>true,'slot'=>$slot,'type'=>$slot,'name'=>$fac['name'],'description'=>$fac['description'],'level'=>$level,'maxLevel'=>$max,'atMax'=>$atMax,'canUpgrade'=>$canUpgrade,'upgradeReason'=>$upgradeReason,'nextLevel'=>$atMax?null:$next,'nextCost'=>$cost,'nextReq'=>[],'building'=>$building,'patients'=>$patients,
    'activity'=>$activity,'adjustable'=>in_array($slot,ZV2_ADJUSTABLE,true),
    'drain'=>zv2_facility_drain($slot,$level,$activityMap[$slot]??1.0),
    'upgradeBenefits'=>$upgradeBenefits,
    'staffing'=>['capacity'=>$capacity,'effect'=>$effects[$slot]??'Assigned survivors keep this facility operational.','survivors'=>$staff]]+$extra);
