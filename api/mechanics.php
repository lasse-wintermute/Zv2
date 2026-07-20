<?php
// Authoritative standalone rules for stronghold time, staffing, combat supplies and raids.

const ZV2_CYCLE_SECONDS = 1200; // ten minutes daylight, ten minutes night
const ZV2_DAY_SECONDS = 600;

function zv2_active_builds(int $uid): array {
    global $db;$out=[];$r=$db->query('SELECT slot,due,to_level FROM builds WHERE userid='.$uid);
    while($r&&($row=$r->fetch_assoc()))$out[]=['slot'=>(int)$row['slot'],'due'=>(int)$row['due'],'toLevel'=>(int)$row['to_level']];return$out;
}

function zv2_tech_effects(int $uid):array{
    global $db;$effects=[];$r=$db->query("SELECT t.effect_key,t.effect_value FROM player_research p JOIN technologies t ON t.id=p.tech_id WHERE p.userid=$uid");
    while($r&&($x=$r->fetch_assoc()))$effects[$x['effect_key']]=($effects[$x['effect_key']]??0)+(float)$x['effect_value'];return$effects;
}
function zv2_has_tech(int $uid,int $tech):bool{global $db;$r=$db->query("SELECT 1 FROM player_research WHERE userid=$uid AND tech_id=$tech LIMIT 1");return(bool)($r&&$r->num_rows);}
function zv2_refresh_production(int $uid):void{global $db;$now=time();$r=$db->query("SELECT j.recipe_id,j.amount,r.result_item,r.result_amount FROM production_jobs j JOIN recipes r ON r.id=j.recipe_id WHERE j.userid=$uid AND j.due<=$now LIMIT 1");if(!$r||!$r->num_rows)return;$j=$r->fetch_assoc();zv2_add_item($uid,(int)$j['result_item'],(int)$j['result_amount']*(int)$j['amount']);$db->query("DELETE FROM production_jobs WHERE userid=$uid");}
function zv2_refresh_training(int $uid):void{global $db;$now=time();$r=$db->query("SELECT survivor_id,focus FROM training_jobs WHERE userid=$uid AND due<=$now");while($r&&($j=$r->fetch_assoc())){$id=(int)$j['survivor_id'];$field=$j['focus']==='defense'?'defense_stat':'attack_stat';$cap=$field==='attack_stat'?10:8;$db->query("UPDATE survivors SET $field=LEAST($cap,$field+1),fatigue=LEAST(100,fatigue+15) WHERE id=$id AND userid=$uid");$db->query("DELETE FROM training_jobs WHERE survivor_id=$id");}}
function zv2_refresh_research(int $uid,array $buildings=[]):void{
    global $db;$now=time();$db->query("INSERT IGNORE INTO research_state(userid,points,last_tick) VALUES($uid,30,$now)");
    $done=$db->query("SELECT tech_id FROM research_jobs WHERE userid=$uid AND due<=$now LIMIT 1");if($done&&$done->num_rows){$tech=(int)$done->fetch_assoc()['tech_id'];$db->query("INSERT IGNORE INTO player_research(userid,tech_id,completed_at) VALUES($uid,$tech,$now)");$db->query("DELETE FROM research_jobs WHERE userid=$uid");$tr=$db->query("SELECT tier FROM technologies WHERE id=$tech LIMIT 1");if($tr&&$tr->num_rows)$db->query("UPDATE strongholds SET points=points+".(int)$tr->fetch_assoc()['tier']." WHERE userid=$uid");}
    $state=$db->query("SELECT points,last_tick FROM research_state WHERE userid=$uid LIMIT 1")->fetch_assoc();$elapsed=max(0,$now-(int)$state['last_tick']);$center=(int)($buildings[12]??0);$workers=0;if($center>0){$w=$db->query("SELECT COUNT(*) n FROM survivors WHERE userid=$uid AND job_facility=12 AND hp>0 AND fatigue<90");$workers=$w?(int)$w->fetch_assoc()['n']:0;}$rate=$center>0?2+$center*2+$workers*12:0;$points=min(999999,(float)$state['points']+$rate*$elapsed/3600);$db->query("UPDATE research_state SET points=$points,last_tick=$now WHERE userid=$uid");
}

// OG power model: every facility drains power by level (facilities.power_req
// curves), the generator produces by the original output curve, and the ratio
// (outputlevel) linearly scales ALL production — a brownout slows, never stops.
const ZV2_POWER_CURVES=[
    'A'=>[5,10,20,30,40,50,70,100,140,200],      // life support, scrapyard, garage, staff area
    'B'=>[10,20,40,60,80,100,140,200,280,400],   // toolshop, research center, HQ
    'C'=>[0,5,10,15,20,25,35,50,70,100],         // storage, fortifications, troop quarters
];
const ZV2_POWER_MAP=[1=>'A',2=>'A',3=>'A',13=>'A',11=>'B',12=>'B',17=>'B',4=>'C',8=>'C',10=>'C'];
// OG `outputadjustable`: these facilities can be throttled, and the activity %
// scales their power draw, their production AND their job capacity together.
const ZV2_ADJUSTABLE=[1,2,3,4,11,12];
function zv2_activity(string $encoded):array{
    $a=pipe_nums($encoded);$out=[];
    for($i=0;$i<=45;$i++){$v=$a[$i]??1;$out[$i]=max(0.0,min(1.0,(float)$v));}
    return $out;
}
function zv2_facility_drain(int $slot,int $level,float $activity=1.0):int{
    if($level<=0||!isset(ZV2_POWER_MAP[$slot]))return 0;
    return (int)round(ZV2_POWER_CURVES[ZV2_POWER_MAP[$slot]][min(9,$level-1)]*$activity);
}
function zv2_power_model(array $buildings,array $activity=[]):array{
    $drain=0;foreach(ZV2_POWER_MAP as$slot=>$c)$drain+=zv2_facility_drain($slot,(int)($buildings[$slot]??0),$activity[$slot]??1.0);
    $genCurve=[15,40,80,145,250,420,695,1140,1880,3065];$gen=(int)($buildings[9]??0);
    $output=10+($gen>0?$genCurve[min(9,$gen-1)]:0);   // base 10 like the OG starting stronghold
    return[$drain,$output];
}

function zv2_staff_effects(int $uid,array $buildings=[],array $activity=[]):array{
    global $db;$life=max(0,(int)($buildings[1]??0));$scrap=max(0,(int)($buildings[2]??0));$garage=max(0,(int)($buildings[3]??0));
    $workers=[];$rate=[1+$life*.15,1+$life*.15,1+$scrap*.20,1+$scrap*.20,1+$garage*.20];$power=0;$medical=0;$craft=0;$defense=(int)($buildings[8]??0)*4;
    $r=$db->query("SELECT s.job_facility,s.attack_stat,s.defense_stat FROM survivors s WHERE s.userid=$uid AND s.job_facility IS NOT NULL AND s.hp>0 AND s.fatigue<90");
    while($r&&($s=$r->fetch_assoc())){$slot=(int)$s['job_facility'];$workers[$slot]=($workers[$slot]??0)+1;
        if($slot===1){$rate[0]+=.25;$rate[1]+=.25;}
        if($slot===2){$rate[2]+=.35;$rate[3]+=.35;$craft++;}
        if($slot===3){$rate[4]+=.35;$craft++;}
        if($slot===11)$craft++;
        if($slot===9)$power+=3;
        if(in_array($slot,[16,22,23],true))$medical++;
        if(in_array($slot,[8,10,17,24,25],true))$defense+=(int)$s['attack_stat']+(int)$s['defense_stat'];
    }
    // Original Z economy: Storage controls the scavenger pool and scavengers
    // drive every raw resource except the uncapped money/water analogue. Zv2
    // scales the original population counts down to named survivors: half base
    // output with no scavenger, normal output with one, 2x with two, etc.
    $scavengerFactor=max(.5,(float)($workers[4]??0))*($activity[4]??1.0);
    for($i=1;$i<=4;$i++)$rate[$i]*=$scavengerFactor;
    $tech=zv2_tech_effects($uid);$rate[0]*=1+($tech['water_rate']??0)/100;$rate[1]*=1+($tech['food_rate']??0)/100;$rate[4]*=1+($tech['petrol_rate']??0)/100;
    $cleared=(int)$db->query("SELECT COUNT(*) n FROM building_runs WHERE userid=$uid AND cleared_at>0")->fetch_assoc()['n'];$clearedBonus=$cleared*.5;$clearedMultiplier=1+$clearedBonus/100;foreach($rate as$i=>$value)$rate[$i]=$value*$clearedMultiplier;
    $started=$db->query("SELECT world_started FROM strongholds WHERE userid=$uid LIMIT 1");$age=$started&&$started->num_rows?max(0,time()-(int)$started->fetch_assoc()['world_started']):999999;$starterBoost=$age<7200?4:($age<28800?2:1);foreach($rate as$i=>$value)$rate[$i]=$value*$starterBoost;
    $power+=(int)($tech['power_bonus']??0);$defense+=(int)($tech['defense_bonus']??0);$fort=$db->query("SELECT COALESCE(SUM(GREATEST(0,v.amount-COALESCE(se.assigned,0))*i.defense_bonus),0) n FROM inventory v JOIN items i ON i.id=v.item_id LEFT JOIN (SELECT q.userid,se.item_id,SUM(se.amount) assigned FROM squad_equipment se JOIN squads q ON q.id=se.squad_id GROUP BY q.userid,se.item_id) se ON se.item_id=v.item_id AND se.userid=v.userid WHERE v.userid=$uid");if($fort)$defense+=(int)$fort->fetch_assoc()['n'];
    // OG activity throttle: each producing facility's output scales with its %
    $rate[0]*=$activity[1]??1.0;$rate[1]*=$activity[1]??1.0;        // Life support → water/food
    $rate[2]*=$activity[2]??1.0;$rate[3]*=$activity[2]??1.0;        // Scrapyard → wood/metal
    $rate[4]*=$activity[3]??1.0;                                    // Garage → petrol
    [$drain,$output]=zv2_power_model($buildings,$activity);$output+=$power;   // engineers + tech add generation
    $powerLevel=$drain>0?min(1.0,$output/$drain):1.0;
    foreach($rate as$i=>$value)$rate[$i]=$value*$powerLevel;        // OG brownout: scales all production
    return['workers'=>$workers,'rate'=>$rate,'starterBoost'=>$starterBoost,'scavengerFactor'=>$scavengerFactor,'clearedBuildings'=>$cleared,'clearedBonus'=>$clearedBonus,'power'=>$output,'drain'=>$drain,'powerLevel'=>$powerLevel,'medical'=>$medical,'craftDiscount'=>min(2,$craft),'defense'=>$defense,'tech'=>$tech];
}

function zv2_mark_building_cleared(int $uid,int $buildingId):array{
    global $db;$r=$db->query("SELECT COUNT(*) total,SUM(CASE WHEN COALESCE(p.discovered,0)=1 THEN 1 ELSE 0 END) discovered,SUM(CASE WHEN TRIM(r.zombies)<>'' OR TRIM(r.inventory)<>'' THEN 1 ELSE 0 END) remaining FROM roommap r LEFT JOIN room_progress p ON p.room_id=r.id AND p.userid=$uid WHERE r.buildingid=$buildingId");$state=$r?$r->fetch_assoc():null;$vehicles=(int)$db->query("SELECT COUNT(*) n FROM world_vehicles wv JOIN roommap r ON r.id=wv.room_id WHERE r.buildingid=$buildingId AND wv.claimed_by IS NULL")->fetch_assoc()['n'];$clear=$state&&(int)$state['total']>0&&(int)$state['discovered']===(int)$state['total']&&(int)$state['remaining']===0&&$vehicles===0;$new=false;if($clear){$now=time();$db->query("UPDATE building_runs SET cleared_at=IF(cleared_at=0,$now,cleared_at) WHERE userid=$uid AND building_id=$buildingId AND cleared_at=0");$new=$db->affected_rows>0;}$count=(int)$db->query("SELECT COUNT(*) n FROM building_runs WHERE userid=$uid AND cleared_at>0")->fetch_assoc()['n'];return['cleared'=>$clear,'new'=>$new,'count'=>$count,'productionBonus'=>$count*.5];
}

// Zombilization storage caps: food by Life support, wood/metal by Scrapyard, petrol by
// Garage, each level^2.5*100 (floor 100). Water is the original's money slot: uncapped.
function zv2_storage_caps(array $buildings):array{
    $cap=fn(int $lvl):float=>max(100.0,pow(max(1,$lvl),2.5)*100);
    $life=(int)($buildings[1]??0);$scrap=(int)($buildings[2]??0);$garage=(int)($buildings[3]??0);
    return[1000000000.0,$cap($life),$cap($scrap),$cap($scrap),$cap($garage)];
}

function zv2_world_clock(array $s):array{
    $now=time();$start=(int)($s['world_started']??$now);if($start<=0)$start=$now;$elapsed=max(0,$now-$start);$within=$elapsed%ZV2_CYCLE_SECONDS;$phase=$within<ZV2_DAY_SECONDS?'day':'night';$next=$now+($phase==='day'?ZV2_DAY_SECONDS-$within:ZV2_CYCLE_SECONDS-$within);$day=(int)floor($elapsed/ZV2_CYCLE_SECONDS)+1;
    // Hordes only muster every 3rd night (~once per real hour) so the economy
    // can outpace the pressure; the day/night rhythm itself stays at 20 minutes.
    return['phase'=>$phase,'day'=>$day,'nextPhaseAt'=>$next,'secondsToPhase'=>$next-$now,'raidCycle'=>(int)floor(($elapsed+ZV2_DAY_SECONDS)/(ZV2_CYCLE_SECONDS*3))];
}

function zv2_resolve_raid(int $uid,int $day,array &$resources,array $effects):array{
    // The nightly zombie horde. Pressure builds over the first ~12 days, then
    // plateaus so an aging world stays survivable. OG-faithful consequences:
    // zombies FIGHT the stronghold (casualties among your people) — they don't
    // steal supplies. The only stock loss is food devoured in the breach,
    // capped at 20% of the store (original stronghold theft was players-only).
    // 6-day grace: scattered infected only (threat 5–10) while the compound is
    // young; real pressure ramps afterwards and plateaus around 29–34.
    global $db;$threat=5+min(12,max(0,$day-6))*2+(($uid*17+$day*13)%6);$defense=(int)$effects['defense'];$breach=max(0,$threat-$defense);$loss=0;$wounded=null;$damage=0;
    if($breach>0){
        $loss=min($breach*2,(int)floor((float)($resources[1]??0)*.2));$resources[1]=max(0,(float)($resources[1]??0)-$loss);
        $victims=1+(int)floor($breach/12);
        $q=$db->query("SELECT id,hp FROM survivors WHERE userid=$uid AND hp>0 ORDER BY job_facility IS NULL DESC,id LIMIT $victims");
        while($q&&($sv=$q->fetch_assoc())){$vid=(int)$sv['id'];$hit=min((int)$sv['hp'],max(1,(int)ceil($breach/2)));if($wounded===null){$wounded=$vid;$damage=$hit;}$db->query("UPDATE survivors SET hp=GREATEST(0,hp-$hit),fatigue=LEAST(100,fatigue+10) WHERE id=$vid");}
    }
    $success=$breach===0?1:0;$wid=$wounded===null?'NULL':(string)$wounded;$now=time();$db->query("INSERT INTO raids(userid,day_number,threat,defense,success,resource_loss,wounded_survivor,damage,created_at) VALUES($uid,$day,$threat,$defense,$success,$loss,$wid,$damage,$now) ON DUPLICATE KEY UPDATE threat=VALUES(threat),defense=VALUES(defense),success=VALUES(success),resource_loss=VALUES(resource_loss),wounded_survivor=VALUES(wounded_survivor),damage=VALUES(damage),created_at=VALUES(created_at)");
    return['day'=>$day,'threat'=>$threat,'defense'=>$defense,'success'=>(bool)$success,'resourceLoss'=>$loss,'woundedSurvivor'=>$wounded,'damage'=>$damage];
}

function zv2_soldier_level(array $survivor):int{return max(1,(int)$survivor['attack_stat']+(int)$survivor['defense_stat']-4);}
function zv2_hospital_duration(int $uid,int $soldierLevel,int $hospitalLevel):int{
    global $db;$tech=zv2_tech_effects($uid);$doctors=0;$r=$db->query("SELECT COUNT(*) n FROM survivors WHERE userid=$uid AND job_facility=16 AND hp>0 AND fatigue<90");if($r)$doctors=(int)$r->fetch_assoc()['n'];
    $base=45+$soldierLevel*25;$speed=1+max(0,$hospitalLevel-1)*.3+$doctors*.15+(($tech['recovery_rate']??0)/100);return max(15,(int)ceil($base/$speed));
}
function zv2_admit_hospital_patients(int $uid,int $squadId=0,array $buildings=[]):array{
    global $db;if(!$buildings){$h=$db->query("SELECT buildings FROM strongholds WHERE userid=$uid LIMIT 1");$buildings=$h&&$h->num_rows?pipe_nums($h->fetch_assoc()['buildings']):[];}$hospital=(int)($buildings[16]??0);
    if($squadId<=0){$hold=$db->query("SELECT location FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();[$hx,$hy]=array_map('intval',explode('|',$hold['location']));}
    $where=$squadId>0?"sm.squad_id=$squadId":"(sm.squad_id IS NULL OR (q.target_x IS NULL AND q.x=$hx AND q.y=$hy))";
    $sql="SELECT s.id,s.name,s.attack_stat,s.defense_stat FROM survivors s LEFT JOIN squad_members sm ON sm.survivor_id=s.id LEFT JOIN squads q ON q.id=sm.squad_id LEFT JOIN hospital_treatments ht ON ht.survivor_id=s.id WHERE s.userid=$uid AND s.hp<=0 AND ht.survivor_id IS NULL AND $where ORDER BY s.id";
    $candidates=[];$r=$db->query($sql);while($r&&($s=$r->fetch_assoc()))$candidates[]=$s;if(!$hospital)return['admitted'=>[],'waiting'=>array_column($candidates,'name')];
    $now=time();$admitted=[];foreach($candidates as$s){$id=(int)$s['id'];$level=zv2_soldier_level($s);$duration=zv2_hospital_duration($uid,$level,$hospital);$due=$now+$duration;$db->begin_transaction();try{$db->query("INSERT IGNORE INTO hospital_treatments(survivor_id,userid,started_at,due,soldier_level,hospital_level) VALUES($id,$uid,$now,$due,$level,$hospital)");$db->query("DELETE FROM squad_members WHERE survivor_id=$id");$db->query("UPDATE survivors SET job_facility=NULL,fatigue=100 WHERE id=$id AND userid=$uid");$db->commit();$admitted[]=['id'=>$id,'name'=>$s['name'],'level'=>$level,'duration'=>$duration,'due'=>$due];}catch(Throwable$e){$db->rollback();throw$e;}}
    return['admitted'=>$admitted,'waiting'=>[]];
}
function zv2_refresh_hospital(int $uid,array $buildings):void{
    global $db;$now=time();$done=$db->query("SELECT survivor_id FROM hospital_treatments WHERE userid=$uid AND due<=$now");while($done&&($p=$done->fetch_assoc())){$id=(int)$p['survivor_id'];$db->query("UPDATE survivors SET hp=max_hp,fatigue=20,recovery_progress=0,job_facility=NULL WHERE id=$id AND userid=$uid");$db->query("DELETE FROM hospital_treatments WHERE survivor_id=$id");}zv2_admit_hospital_patients($uid,0,$buildings);
}

function zv2_refresh(int $uid):void{
    global $db;$r=$db->query('SELECT ressis,rates,last_tick,buildings,activebuildings,world_started,last_raid_cycle FROM strongholds WHERE userid='.$uid.' LIMIT 1');if(!$r||!$r->num_rows)return;$s=$r->fetch_assoc();$now=time();$elapsed=max(0,$now-(int)$s['last_tick']);$activity=zv2_activity((string)$s['activebuildings']);
    $buildings=pipe_nums($s['buildings']);$points=0;$q=$db->query('SELECT slot,to_level FROM builds WHERE userid='.$uid.' AND due<='.$now);while($q&&($b=$q->fetch_assoc())){$buildings[(int)$b['slot']]=(int)$b['to_level'];$points+=(int)$b['to_level'];}$db->query('DELETE FROM builds WHERE userid='.$uid.' AND due<='.$now);if($points)$db->query("UPDATE strongholds SET points=points+$points WHERE userid=$uid");zv2_refresh_research($uid,$buildings);zv2_refresh_production($uid);zv2_refresh_training($uid);zv2_refresh_hospital($uid,$buildings);
    $effects=zv2_staff_effects($uid,$buildings,$activity);$res=pipe_nums($s['ressis']);$rates=pipe_nums($s['rates']);$caps=zv2_storage_caps($buildings);for($i=0;$i<5;$i++)$res[$i]=round(min($caps[$i],($res[$i]??0)+($rates[$i]??0)*$effects['rate'][$i]*$elapsed/3600),3);
    // OG: every survivor eats 3 food/day; an empty larder wears everyone down.
    $alive=(int)$db->query("SELECT COUNT(*) n FROM survivors WHERE userid=$uid AND hp>0")->fetch_assoc()['n'];
    if($alive>0&&$elapsed>0){$res[1]=round(max(0,($res[1]??0)-$alive*3*$elapsed/86400),3);
        if(($res[1]??0)<=0)$db->query("UPDATE survivors SET fatigue=LEAST(100,fatigue+".round($elapsed/3600*5,3).") WHERE userid=$uid AND hp>0");}
    if($elapsed>0){$hours=$elapsed/3600;$db->query("UPDATE survivors SET fatigue=CASE WHEN job_facility IS NULL THEN GREATEST(0,fatigue-".($hours*30).") ELSE LEAST(100,fatigue+".($hours*18).") END WHERE userid=$uid");if($effects['medical']>0){$patients=$db->query("SELECT s.id,s.hp,s.max_hp,s.recovery_progress FROM survivors s LEFT JOIN hospital_treatments ht ON ht.survivor_id=s.id WHERE s.userid=$uid AND s.job_facility IS NULL AND s.hp<s.max_hp AND ht.survivor_id IS NULL");$recovery=1+(($effects['tech']['recovery_rate']??0)/100);while($patients&&($p=$patients->fetch_assoc())){$progress=(float)$p['recovery_progress']+$elapsed*$effects['medical']*$recovery/300;$heal=(int)floor($progress);$progress-=$heal;$newHp=min((int)$p['max_hp'],(int)$p['hp']+$heal);$db->query("UPDATE survivors SET hp=$newHp,recovery_progress=$progress WHERE id=".(int)$p['id']);}}}
    $clock=zv2_world_clock($s);$last=min((int)$s['last_raid_cycle'],$clock['raidCycle']);/* self-heal counters saved under the old nightly cadence */if($clock['raidCycle']>$last){zv2_resolve_raid($uid,$clock['day'],$res,$effects);$last=$clock['raidCycle'];}
    $rs=$db->real_escape_string(implode('|',$res));$bs=$db->real_escape_string(implode('|',$buildings));$db->query("UPDATE strongholds SET ressis='$rs',buildings='$bs',last_tick=$now,last_raid_cycle=$last WHERE userid=$uid");
}

function zv2_latest_raid(int $uid):?array{global $db;$r=$db->query("SELECT r.*,s.name wounded_name FROM raids r LEFT JOIN survivors s ON s.id=r.wounded_survivor WHERE r.userid=$uid ORDER BY r.id DESC LIMIT 1");if(!$r||!$r->num_rows)return null;$x=$r->fetch_assoc();return['day'=>(int)$x['day_number'],'threat'=>(int)$x['threat'],'defense'=>(int)$x['defense'],'success'=>(bool)$x['success'],'resourceLoss'=>(int)$x['resource_loss'],'wounded'=>$x['wounded_name'],'damage'=>(int)$x['damage'],'time'=>(int)$x['created_at']];}
function zv2_item_weight(int $itemId):float{global $db;$r=$db->query("SELECT category FROM items WHERE id=$itemId LIMIT 1");$cat=$r&&$r->num_rows?$r->fetch_assoc()['category']:'';return match($cat){'weapon'=>3.0,'fortification'=>4.0,'material'=>1.5,'ammo'=>0.2,'food','drink','medicine'=>0.5,'fuel'=>2.0,'technology','equipment','repair'=>1.0,default=>1.0};}
function zv2_squad_vehicle(int $uid,int $squadId):?array{global $db;$r=$db->query("SELECT v.*,t.name type_name,t.description,t.seats,t.cargo_bonus,t.speed_bonus,t.fuel_capacity,t.fuel_per_tile,t.garage_level FROM vehicles v JOIN vehicle_types t ON t.id=v.type_id WHERE v.userid=$uid AND v.assigned_squad=$squadId LIMIT 1");if(!$r||!$r->num_rows)return null;$v=$r->fetch_assoc();return['id'=>(int)$v['id'],'typeId'=>(int)$v['type_id'],'name'=>$v['name'],'type'=>$v['type_name'],'description'=>$v['description'],'fuel'=>(int)$v['fuel'],'fuelCapacity'=>(int)$v['fuel_capacity'],'fuelPerTile'=>(int)$v['fuel_per_tile'],'seats'=>(int)$v['seats']+(int)$v['seats_upgrade'],'baseSeats'=>(int)$v['seats'],'seatsUpgrade'=>(int)$v['seats_upgrade'],'cargoBonus'=>(int)$v['cargo_bonus']+(int)$v['cargo_upgrade']*10,'baseCargoBonus'=>(int)$v['cargo_bonus'],'cargoUpgrade'=>(int)$v['cargo_upgrade'],'speedBonus'=>(int)$v['speed_bonus'],'garageLevel'=>(int)$v['garage_level']];}
function zv2_vehicle_travel(int $uid,int $squadId,int $distance,bool $consume=true,bool $allowEmergencyReturn=false):array{global $db;$vehicle=zv2_squad_vehicle($uid,$squadId);if(!$vehicle)return['vehicle'=>null,'speedBonus'=>0,'fuelUsed'=>0,'emergency'=>false];$members=(int)$db->query("SELECT COUNT(*) n FROM squad_members WHERE squad_id=$squadId")->fetch_assoc()['n'];if($members>$vehicle['seats'])json_err('vehicle_seats','The '.$vehicle['name'].' only has '.$vehicle['seats'].' seats for '.$members.' squad members.');$fuel=max(1,$distance*$vehicle['fuelPerTile']);if($vehicle['fuel']<$fuel){if($allowEmergencyReturn)return['vehicle'=>$vehicle,'speedBonus'=>0,'fuelUsed'=>0,'emergency'=>true];json_err('vehicle_fuel',$vehicle['name'].' needs '.$fuel.' fuel for this route but only has '.$vehicle['fuel'].'. Refuel at the Garage.');}if($consume)$db->query("UPDATE vehicles SET fuel=GREATEST(0,fuel-$fuel) WHERE id=".$vehicle['id']." AND userid=$uid");return['vehicle'=>$vehicle,'speedBonus'=>$vehicle['speedBonus'],'fuelUsed'=>$fuel,'emergency'=>false];}
function zv2_squad_cargo(int $squadId):array{global $db;$items=[];$used=0.0;$r=$db->query("SELECT c.item_id,c.amount,i.name,i.category,i.healing,i.repair_amount FROM squad_cargo c JOIN items i ON i.id=c.item_id WHERE c.squad_id=$squadId AND c.amount>0 ORDER BY i.name");while($r&&($x=$r->fetch_assoc())){$w=zv2_item_weight((int)$x['item_id']);$used+=$w*(int)$x['amount'];$items[]=['id'=>(int)$x['item_id'],'name'=>$x['name'],'category'=>$x['category'],'amount'=>(int)$x['amount'],'weight'=>$w,'healing'=>(int)$x['healing'],'repairAmount'=>(int)$x['repair_amount']];}$members=(int)$db->query("SELECT COUNT(*) n FROM squad_members WHERE squad_id=$squadId")->fetch_assoc()['n'];$sq=$db->query("SELECT userid FROM squads WHERE id=$squadId LIMIT 1");$uid=$sq&&$sq->num_rows?(int)$sq->fetch_assoc()['userid']:0;$leadership=$uid?(float)(zv2_tech_effects($uid)['leadership']??0):0;$footCapacity=round($members*8*(1+$leadership/100),1);$vehicleBonus=0;$vq=$db->query("SELECT t.cargo_bonus+v.cargo_upgrade*10 bonus FROM vehicles v JOIN vehicle_types t ON t.id=v.type_id WHERE v.assigned_squad=$squadId LIMIT 1");if($vq&&$vq->num_rows)$vehicleBonus=(int)$vq->fetch_assoc()['bonus'];return['items'=>$items,'used'=>round($used,1),'capacity'=>$footCapacity+$vehicleBonus,'footCapacity'=>$footCapacity,'vehicleBonus'=>$vehicleBonus,'leadershipBonus'=>$leadership];}
function zv2_add_cargo(int $squadId,int $itemId,int $wanted):int{global $db;$cargo=zv2_squad_cargo($squadId);$weight=zv2_item_weight($itemId);$fits=$weight>0?(int)floor(max(0,$cargo['capacity']-$cargo['used'])/$weight):$wanted;$take=min($wanted,$fits);if($take>0)$db->query("INSERT INTO squad_cargo(squad_id,item_id,amount) VALUES($squadId,$itemId,$take) ON DUPLICATE KEY UPDATE amount=amount+VALUES(amount)");return$take;}
function zv2_squad_equipment(int $uid,int $squadId):array{
 global $db;$crew=$db->query("SELECT COUNT(*) members,COALESCE(SUM(s.attack_stat),0) attack_base,COALESCE(SUM(s.defense_stat),0) defense_base FROM squad_members sm JOIN survivors s ON s.id=sm.survivor_id WHERE sm.squad_id=$squadId AND s.userid=$uid")->fetch_assoc();$members=(int)$crew['members'];$items=[];$attack=0;$defense=0;$weapons=0;$defenseItems=0;
 $r=$db->query("SELECT se.item_id,se.amount,i.name,i.category,i.attack_bonus,i.defense_bonus FROM squad_equipment se JOIN squads q ON q.id=se.squad_id JOIN items i ON i.id=se.item_id WHERE se.squad_id=$squadId AND q.userid=$uid ORDER BY i.category,i.name");while($r&&($i=$r->fetch_assoc())){$amount=(int)$i['amount'];$slot=(int)$i['attack_bonus']>0?'weapon':'defense';if($slot==='weapon')$weapons+=$amount;else$defenseItems+=$amount;$attack+=(int)$i['attack_bonus']*$amount;$defense+=(int)$i['defense_bonus']*$amount;$items[]=['id'=>(int)$i['item_id'],'name'=>$i['name'],'category'=>$i['category'],'slot'=>$slot,'amount'=>$amount,'attackBonus'=>(int)$i['attack_bonus'],'defenseBonus'=>(int)$i['defense_bonus']];}
 return['items'=>$items,'slots'=>['weapons'=>['used'=>$weapons,'capacity'=>$members],'defense'=>['used'=>$defenseItems,'capacity'=>$members?max(1,(int)ceil($members/2)):0]],'attackBonus'=>$attack,'defenseBonus'=>$defense,'perMemberAttack'=>$members?(int)ceil($attack/$members):0,'perMemberDefense'=>$members?(int)ceil($defense/$members):0,'stats'=>['attack'=>(int)$crew['attack_base']+$attack,'defense'=>(int)$crew['defense_base']+$defense,'baseAttack'=>(int)$crew['attack_base'],'baseDefense'=>(int)$crew['defense_base']]];
}
function zv2_squad(int $uid,int $squadId=0,bool $finalize=true):array{
 global $db;$where=$squadId>0?"AND id=$squadId":'';$r=$db->query("SELECT * FROM squads WHERE userid=$uid $where ORDER BY id LIMIT 1");
 if(!$r||!$r->num_rows){if($squadId>0)json_err('bad_squad','Choose one of your squads.');$h=$db->query("SELECT location FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();$p=explode('|',$h['location']);$db->query("INSERT INTO squads(userid,name,x,y) VALUES($uid,'Alpha',".(int)$p[0].",".(int)$p[1].")");return zv2_squad($uid,(int)$db->insert_id,$finalize);}
 $s=$r->fetch_assoc();$id=(int)$s['id'];
 if($finalize&&(int)$s['arrives_at']>0&&(int)$s['arrives_at']<=time()){
  $x=(int)$s['target_x'];$y=(int)$s['target_y'];$fog=$db->query("SELECT data FROM discovered WHERE userid=$uid")->fetch_assoc()['data'];$pos=($x-1)+($y-1)*50;$fog[$pos]='1';$esc=$db->real_escape_string($fog);$db->query("UPDATE discovered SET data='$esc' WHERE userid=$uid");$events=[];
  $home=$db->query("SELECT location FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc()['location'];
  if($home==="$x|$y"){$cargo=zv2_squad_cargo($id);$events[]=$cargo['items']?'The squad returned to the stronghold with loot ready to deposit.':'The squad returned to the stronghold.';$care=zv2_admit_hospital_patients($uid,$id);if($care['admitted']){$names=implode(', ',array_column($care['admitted'],'name'));$events[]=$names.' admitted to Hospital for timed treatment.';}elseif($care['waiting'])$events[]=count($care['waiting']).' critical survivor(s) need a Hospital before treatment can begin.';}
  else{$roll=($id*31+$x*7+$y*13)%4;if($roll===1){$item=(($x+$y)%2)?5:6;$take=zv2_add_cargo($id,$item,2);if($take)$events[]='Travel event: found an abandoned supply bag.';}elseif($roll===2){$loadout=zv2_squad_equipment($uid,$id);if(($loadout['perMemberDefense']??0)>0)$events[]='Travel event: squad armor absorbed a roadside ambush.';else{$victim=$db->query("SELECT s.id,s.name FROM squad_members m JOIN survivors s ON s.id=m.survivor_id WHERE m.squad_id=$id AND s.hp>0 ORDER BY s.fatigue,s.id LIMIT 1");if($victim&&$victim->num_rows){$v=$victim->fetch_assoc();$db->query("UPDATE survivors SET hp=GREATEST(0,hp-1),fatigue=LEAST(100,fatigue+8) WHERE id=".(int)$v['id']);$events[]='Travel event: roadside ambush; '.$v['name'].' was wounded.';}}}elseif($roll===3)$events[]='Travel event: a distant horde forced a cautious detour.';else $events[]='Travel event: the route remained quiet.';}
  $rq=$db->query("SELECT * FROM recruit_encounters WHERE userid=$uid AND x=$x AND y=$y AND found_at=0 LIMIT 1");if($rq&&$rq->num_rows){$recruit=$rq->fetch_assoc();$name=$db->real_escape_string($recruit['name']);$hp=10+(int)$recruit['defense_stat'];$db->query("INSERT INTO survivors(userid,name,hp,max_hp,attack_stat,defense_stat) VALUES($uid,'$name',$hp,$hp,".(int)$recruit['attack_stat'].",".(int)$recruit['defense_stat'].")");$survivor=(int)$db->insert_id;$db->query("UPDATE recruit_encounters SET found_at=".time().",joined_survivor=$survivor WHERE id=".(int)$recruit['id']);$events[]='Found '.$recruit['name'].' alive. They joined the stronghold.';}
  $event=implode(' ',$events);$ee=$db->real_escape_string($event);if($event){$type=$home==="$x|$y"?'return':'travel';$db->query("INSERT INTO squad_events(squad_id,event_type,message,created_at) VALUES($id,'$type','$ee',".time().")");}$db->query("UPDATE squads SET x=$x,y=$y,target_x=NULL,target_y=NULL,started_at=0,arrives_at=0,last_event='$ee' WHERE id=$id AND userid=$uid");return zv2_squad($uid,$id,false);
 }
 $crew=[];$mq=$db->query("SELECT survivor_id FROM squad_members WHERE squad_id=$id ORDER BY survivor_id");while($mq&&($m=$mq->fetch_assoc()))$crew[]=(int)$m['survivor_id'];return['id'=>$id,'name'=>$s['name'],'x'=>(int)$s['x'],'y'=>(int)$s['y'],'targetX'=>$s['target_x']===null?null:(int)$s['target_x'],'targetY'=>$s['target_y']===null?null:(int)$s['target_y'],'startedAt'=>(int)$s['started_at'],'arrivesAt'=>(int)$s['arrives_at'],'traveling'=>(int)$s['arrives_at']>time(),'crew'=>$crew,'cargo'=>zv2_squad_cargo($id),'vehicle'=>zv2_squad_vehicle($uid,$id),'equipment'=>zv2_squad_equipment($uid,$id),'lastEvent'=>$s['last_event']];
}
function zv2_squads(int $uid,bool $finalize=true):array{global $db;$ids=[];$r=$db->query("SELECT id FROM squads WHERE userid=$uid ORDER BY id");while($r&&($s=$r->fetch_assoc()))$ids[]=(int)$s['id'];if(!$ids)return[zv2_squad($uid,0,$finalize)];$out=[];foreach($ids as$id)$out[]=zv2_squad($uid,$id,$finalize);return$out;}
function zv2_item_owned(int $uid,int $itemId):int{global $db;$r=$db->query("SELECT amount FROM inventory WHERE userid=$uid AND item_id=$itemId LIMIT 1");return($r&&$r->num_rows)?(int)$r->fetch_assoc()['amount']:0;}
function zv2_item_name(int $itemId):string{global $db;$r=$db->query('SELECT name FROM items WHERE id='.$itemId.' LIMIT 1');return($r&&$r->num_rows)?(string)$r->fetch_assoc()['name']:'Unknown item';}
function zv2_add_item(int $uid,int $itemId,int $amount):void{global $db;$r=$db->query("SELECT max_durability FROM items WHERE id=$itemId LIMIT 1");$max=($r&&$r->num_rows)?(int)$r->fetch_assoc()['max_durability']:0;if($max>0){$effects=zv2_tech_effects($uid);$max+=(int)floor($max*(float)($effects['durability_bonus']??0)/100);}$durability=$max>0?(string)$max:'NULL';$db->query("INSERT INTO inventory(userid,item_id,amount,durability) VALUES($uid,$itemId,$amount,$durability) ON DUPLICATE KEY UPDATE amount=amount+VALUES(amount),durability=IF(durability IS NULL,VALUES(durability),GREATEST(durability,VALUES(durability)))");}
function zv2_is_seen(int $uid,int $x,int $y):bool{global $db;$r=$db->query('SELECT data FROM discovered WHERE userid='.$uid.' LIMIT 1');return$r&&$r->num_rows&&substr((string)$r->fetch_assoc()['data'],($x-1)+($y-1)*50,1)==='1';}
