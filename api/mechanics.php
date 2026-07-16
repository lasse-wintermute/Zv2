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
    $done=$db->query("SELECT tech_id FROM research_jobs WHERE userid=$uid AND due<=$now LIMIT 1");if($done&&$done->num_rows){$tech=(int)$done->fetch_assoc()['tech_id'];$db->query("INSERT IGNORE INTO player_research(userid,tech_id,completed_at) VALUES($uid,$tech,$now)");$db->query("DELETE FROM research_jobs WHERE userid=$uid");}
    $state=$db->query("SELECT points,last_tick FROM research_state WHERE userid=$uid LIMIT 1")->fetch_assoc();$elapsed=max(0,$now-(int)$state['last_tick']);$center=(int)($buildings[12]??0);$workers=0;if($center>0){$w=$db->query("SELECT COUNT(*) n FROM survivors WHERE userid=$uid AND job_facility=12 AND hp>0 AND fatigue<90");$workers=$w?(int)$w->fetch_assoc()['n']:0;}$rate=$center>0?2+$center*2+$workers*12:0;$points=min(9999,(float)$state['points']+$rate*$elapsed/3600);$db->query("UPDATE research_state SET points=$points,last_tick=$now WHERE userid=$uid");
}

function zv2_staff_effects(int $uid,array $buildings=[]):array{
    global $db;$workers=[];$rate=[1,1,1,1,1];$power=0;$medical=0;$craft=0;$defense=(int)($buildings[8]??0)*4;
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
    $tech=zv2_tech_effects($uid);$rate[0]*=1+($tech['water_rate']??0)/100;$rate[1]*=1+($tech['food_rate']??0)/100;$rate[4]*=1+($tech['petrol_rate']??0)/100;$power+=(int)($tech['power_bonus']??0);$defense+=(int)($tech['defense_bonus']??0);$fort=$db->query("SELECT COALESCE(SUM(v.amount*i.defense_bonus),0) n FROM inventory v JOIN items i ON i.id=v.item_id WHERE v.userid=$uid");if($fort)$defense+=(int)$fort->fetch_assoc()['n'];
    return['workers'=>$workers,'rate'=>$rate,'power'=>$power,'medical'=>$medical,'craftDiscount'=>min(2,$craft),'defense'=>$defense,'tech'=>$tech];
}

function zv2_world_clock(array $s):array{
    $now=time();$start=(int)($s['world_started']??$now);if($start<=0)$start=$now;$elapsed=max(0,$now-$start);$within=$elapsed%ZV2_CYCLE_SECONDS;$phase=$within<ZV2_DAY_SECONDS?'day':'night';$next=$now+($phase==='day'?ZV2_DAY_SECONDS-$within:ZV2_CYCLE_SECONDS-$within);$day=(int)floor($elapsed/ZV2_CYCLE_SECONDS)+1;
    return['phase'=>$phase,'day'=>$day,'nextPhaseAt'=>$next,'secondsToPhase'=>$next-$now,'raidCycle'=>(int)floor(($elapsed+ZV2_DAY_SECONDS)/ZV2_CYCLE_SECONDS)];
}

function zv2_resolve_raid(int $uid,int $day,array &$resources,array $effects):array{
    global $db;$threat=7+$day*2+(($uid*17+$day*13)%6);$defense=(int)$effects['defense'];$breach=max(0,$threat-$defense);$loss=$breach*4;$wounded=null;$damage=0;
    if($breach>0){for($i=0;$i<4;$i++)$resources[$i]=max(0,(float)($resources[$i]??0)-$loss);$q=$db->query("SELECT id,hp FROM survivors WHERE userid=$uid AND hp>0 ORDER BY job_facility IS NULL DESC,id LIMIT 1");if($q&&$q->num_rows){$sv=$q->fetch_assoc();$wounded=(int)$sv['id'];$damage=min((int)$sv['hp'],max(1,(int)ceil($breach/2)));$db->query("UPDATE survivors SET hp=GREATEST(0,hp-$damage),fatigue=LEAST(100,fatigue+10) WHERE id=$wounded");}}
    $success=$breach===0?1:0;$wid=$wounded===null?'NULL':(string)$wounded;$now=time();$db->query("INSERT INTO raids(userid,day_number,threat,defense,success,resource_loss,wounded_survivor,damage,created_at) VALUES($uid,$day,$threat,$defense,$success,$loss,$wid,$damage,$now) ON DUPLICATE KEY UPDATE threat=VALUES(threat),defense=VALUES(defense),success=VALUES(success),resource_loss=VALUES(resource_loss),wounded_survivor=VALUES(wounded_survivor),damage=VALUES(damage),created_at=VALUES(created_at)");
    return['day'=>$day,'threat'=>$threat,'defense'=>$defense,'success'=>(bool)$success,'resourceLoss'=>$loss,'woundedSurvivor'=>$wounded,'damage'=>$damage];
}

function zv2_refresh(int $uid):void{
    global $db;$r=$db->query('SELECT ressis,rates,last_tick,buildings,world_started,last_raid_cycle FROM strongholds WHERE userid='.$uid.' LIMIT 1');if(!$r||!$r->num_rows)return;$s=$r->fetch_assoc();$now=time();$elapsed=max(0,$now-(int)$s['last_tick']);
    $buildings=pipe_nums($s['buildings']);$q=$db->query('SELECT slot,to_level FROM builds WHERE userid='.$uid.' AND due<='.$now);while($q&&($b=$q->fetch_assoc()))$buildings[(int)$b['slot']]=(int)$b['to_level'];$db->query('DELETE FROM builds WHERE userid='.$uid.' AND due<='.$now);zv2_refresh_research($uid,$buildings);zv2_refresh_production($uid);zv2_refresh_training($uid);
    $effects=zv2_staff_effects($uid,$buildings);$res=pipe_nums($s['ressis']);$rates=pipe_nums($s['rates']);for($i=0;$i<5;$i++)$res[$i]=round(min(10000,($res[$i]??0)+($rates[$i]??0)*$effects['rate'][$i]*$elapsed/3600),3);
    if($elapsed>0){$hours=$elapsed/3600;$db->query("UPDATE survivors SET fatigue=CASE WHEN job_facility IS NULL THEN GREATEST(0,fatigue-".($hours*30).") ELSE LEAST(100,fatigue+".($hours*18).") END WHERE userid=$uid");if($effects['medical']>0){$patients=$db->query("SELECT id,hp,max_hp,recovery_progress FROM survivors WHERE userid=$uid AND job_facility IS NULL AND hp<max_hp");$recovery=1+(($effects['tech']['recovery_rate']??0)/100);while($patients&&($p=$patients->fetch_assoc())){$progress=(float)$p['recovery_progress']+$elapsed*$effects['medical']*$recovery/300;$heal=(int)floor($progress);$progress-=$heal;$newHp=min((int)$p['max_hp'],(int)$p['hp']+$heal);$db->query("UPDATE survivors SET hp=$newHp,recovery_progress=$progress WHERE id=".(int)$p['id']);}}}
    $clock=zv2_world_clock($s);$last=(int)$s['last_raid_cycle'];if($clock['raidCycle']>$last){zv2_resolve_raid($uid,$clock['day'],$res,$effects);$last=$clock['raidCycle'];}
    $rs=$db->real_escape_string(implode('|',$res));$bs=$db->real_escape_string(implode('|',$buildings));$db->query("UPDATE strongholds SET ressis='$rs',buildings='$bs',last_tick=$now,last_raid_cycle=$last WHERE userid=$uid");
}

function zv2_latest_raid(int $uid):?array{global $db;$r=$db->query("SELECT r.*,s.name wounded_name FROM raids r LEFT JOIN survivors s ON s.id=r.wounded_survivor WHERE r.userid=$uid ORDER BY r.id DESC LIMIT 1");if(!$r||!$r->num_rows)return null;$x=$r->fetch_assoc();return['day'=>(int)$x['day_number'],'threat'=>(int)$x['threat'],'defense'=>(int)$x['defense'],'success'=>(bool)$x['success'],'resourceLoss'=>(int)$x['resource_loss'],'wounded'=>$x['wounded_name'],'damage'=>(int)$x['damage'],'time'=>(int)$x['created_at']];}
function zv2_squad(int $uid,int $squadId=0,bool $finalize=true):array{global $db;$where=$squadId>0?"AND id=$squadId":'';$r=$db->query("SELECT * FROM squads WHERE userid=$uid $where ORDER BY id LIMIT 1");if(!$r||!$r->num_rows){if($squadId>0)json_err('bad_squad','Choose one of your squads.');$h=$db->query("SELECT location FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();$p=explode('|',$h['location']);$db->query("INSERT INTO squads(userid,name,x,y) VALUES($uid,'Alpha',".(int)$p[0].",".(int)$p[1].")");return zv2_squad($uid,(int)$db->insert_id,$finalize);}$s=$r->fetch_assoc();$id=(int)$s['id'];if($finalize&&(int)$s['arrives_at']>0&&(int)$s['arrives_at']<=time()){$x=(int)$s['target_x'];$y=(int)$s['target_y'];$fog=$db->query("SELECT data FROM discovered WHERE userid=$uid")->fetch_assoc()['data'];$pos=($x-1)+($y-1)*50;$fog[$pos]='1';$esc=$db->real_escape_string($fog);$db->query("UPDATE discovered SET data='$esc' WHERE userid=$uid");$event='';$rq=$db->query("SELECT * FROM recruit_encounters WHERE userid=$uid AND x=$x AND y=$y AND found_at=0 LIMIT 1");if($rq&&$rq->num_rows){$recruit=$rq->fetch_assoc();$name=$db->real_escape_string($recruit['name']);$hp=10+(int)$recruit['defense_stat'];$db->query("INSERT INTO survivors(userid,name,hp,max_hp,attack_stat,defense_stat) VALUES($uid,'$name',$hp,$hp,".(int)$recruit['attack_stat'].",".(int)$recruit['defense_stat'].")");$survivor=(int)$db->insert_id;$db->query("UPDATE recruit_encounters SET found_at=".time().",joined_survivor=$survivor WHERE id=".(int)$recruit['id']);$event='Found '.$recruit['name'].' alive. They joined the stronghold.';}$ee=$db->real_escape_string($event);$db->query("UPDATE squads SET x=$x,y=$y,target_x=NULL,target_y=NULL,started_at=0,arrives_at=0,last_event='$ee' WHERE id=$id AND userid=$uid");return zv2_squad($uid,$id,false);} $crew=[];$mq=$db->query("SELECT survivor_id FROM squad_members WHERE squad_id=$id ORDER BY survivor_id");while($mq&&($m=$mq->fetch_assoc()))$crew[]=(int)$m['survivor_id'];return['id'=>$id,'name'=>$s['name'],'x'=>(int)$s['x'],'y'=>(int)$s['y'],'targetX'=>$s['target_x']===null?null:(int)$s['target_x'],'targetY'=>$s['target_y']===null?null:(int)$s['target_y'],'startedAt'=>(int)$s['started_at'],'arrivesAt'=>(int)$s['arrives_at'],'traveling'=>(int)$s['arrives_at']>time(),'crew'=>$crew,'lastEvent'=>$s['last_event']];}
function zv2_squads(int $uid,bool $finalize=true):array{global $db;$ids=[];$r=$db->query("SELECT id FROM squads WHERE userid=$uid ORDER BY id");while($r&&($s=$r->fetch_assoc()))$ids[]=(int)$s['id'];if(!$ids)return[zv2_squad($uid,0,$finalize)];$out=[];foreach($ids as$id)$out[]=zv2_squad($uid,$id,$finalize);return$out;}
function zv2_item_owned(int $uid,int $itemId):int{global $db;$r=$db->query("SELECT amount FROM inventory WHERE userid=$uid AND item_id=$itemId LIMIT 1");return($r&&$r->num_rows)?(int)$r->fetch_assoc()['amount']:0;}
function zv2_item_name(int $itemId):string{global $db;$r=$db->query('SELECT name FROM items WHERE id='.$itemId.' LIMIT 1');return($r&&$r->num_rows)?(string)$r->fetch_assoc()['name']:'Unknown item';}
function zv2_add_item(int $uid,int $itemId,int $amount):void{global $db;$r=$db->query("SELECT max_durability FROM items WHERE id=$itemId LIMIT 1");$max=($r&&$r->num_rows)?(int)$r->fetch_assoc()['max_durability']:0;$durability=$max>0?(string)$max:'NULL';$db->query("INSERT INTO inventory(userid,item_id,amount,durability) VALUES($uid,$itemId,$amount,$durability) ON DUPLICATE KEY UPDATE amount=amount+VALUES(amount),durability=IF(durability IS NULL,VALUES(durability),durability)");}
function zv2_is_seen(int $uid,int $x,int $y):bool{global $db;$r=$db->query('SELECT data FROM discovered WHERE userid='.$uid.' LIMIT 1');return$r&&$r->num_rows&&substr((string)$r->fetch_assoc()['data'],($x-1)+($y-1)*50,1)==='1';}
