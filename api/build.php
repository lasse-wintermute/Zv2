<?php
require __DIR__ . '/_bootstrap.php'; global $db;
if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST')json_err('method','POST required',405);
$uid=api_require_user(); $slot=(int)($_POST['slot']??0); if($slot<1||$slot>45)json_err('bad_slot','slot must be 1..45');$gridX=isset($_POST['gridX'])?(int)$_POST['gridX']:-1;$gridY=isset($_POST['gridY'])?(int)$_POST['gridY']:-1;
zv2_refresh($uid);
if(($_POST['action']??'')==='cancel'){
 // OG cancelupgrade: abort the job, refund HALF the resources.
 $bq=$db->query("SELECT slot,to_level FROM builds WHERE userid=$uid AND slot=$slot LIMIT 1");if(!$bq||!$bq->num_rows)json_err('no_build','No construction to cancel there.');$b=$bq->fetch_assoc();$toLevel=(int)$b['to_level'];
 $cq=$db->query("SELECT water,food,wood,metal,petrol FROM facility_costs WHERE facility_id=$slot AND level=$toLevel LIMIT 1");$c=$cq&&$cq->num_rows?$cq->fetch_assoc():['water'=>0,'food'=>0,'wood'=>0,'metal'=>0,'petrol'=>0];
 $hold=$db->query("SELECT ressis FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();$res=pipe_nums($hold['ressis']);
 foreach(['water','food','wood','metal','petrol']as$i=>$key)$res[$i]=($res[$i]??0)+(int)floor((int)$c[$key]/2);
 $rs=$db->real_escape_string(implode('|',$res));
 $db->begin_transaction();try{$db->query("DELETE FROM builds WHERE userid=$uid AND slot=$slot");if($toLevel===1)$db->query("DELETE FROM facility_positions WHERE userid=$uid AND slot=$slot");$db->query("UPDATE strongholds SET ressis='$rs' WHERE userid=$uid");$db->commit();}catch(Throwable$e){$db->rollback();throw$e;}
 json_out(['ok'=>true,'result'=>'canceled','message'=>'Construction canceled — half the resources were recovered.','slot'=>$slot]);
}
// Emplacements are placed repeatedly and raised immediately: a defence is a dozen
// guns, and queueing them one at a time behind the single construction slot would
// make laying out a firing line take an entire night.
if(in_array($slot,ZV2_EMPLACEMENT_TYPES,true)){
 zv2_ensure_compound($uid);
 if($gridX<0||$gridX>=ZV2_GRID_W||$gridY<0||$gridY>=ZV2_GRID_H)json_out(['ok'=>false,'result'=>'bad_plot','message'=>'Choose a spot inside the compound.','slot'=>$slot]);
 $clash=$db->query("SELECT 1 FROM emplacements WHERE userid=$uid AND grid_x=$gridX AND grid_y=$gridY LIMIT 1");
 if($clash&&$clash->num_rows)json_out(['ok'=>false,'result'=>'plot_occupied','message'=>'Something already stands there.','slot'=>$slot]);
 $clash=$db->query("SELECT 1 FROM facility_positions WHERE userid=$uid AND grid_x=$gridX AND grid_y=$gridY LIMIT 1");
 if($clash&&$clash->num_rows)json_out(['ok'=>false,'result'=>'plot_occupied','message'=>'That plot holds a facility.','slot'=>$slot]);
 $clash=$db->query("SELECT kind FROM compound_structures WHERE userid=$uid AND grid_x=$gridX AND grid_y=$gridY LIMIT 1");
 if($clash&&$clash->num_rows){$k=$clash->fetch_assoc()['kind'];json_out(['ok'=>false,'result'=>'plot_blocked','message'=>$k==='house'?'A house already stands there.':'That is a gateway — keep it clear.','slot'=>$slot]);}
 $hold=$db->query("SELECT ressis FROM strongholds WHERE userid=$uid LIMIT 1");if(!$hold||!$hold->num_rows)json_err('no_stronghold','Stronghold not found.',404);
 $res=pipe_nums($hold->fetch_assoc()['ressis']);
 $cq=$db->query("SELECT water,food,wood,metal,petrol FROM facility_costs WHERE facility_id=$slot AND level=1 LIMIT 1");
 if(!$cq||!$cq->num_rows)json_out(['ok'=>false,'result'=>'no_cost','message'=>'That emplacement has no build cost defined.','slot'=>$slot]);
 $cost=$cq->fetch_assoc();$keys=['water','food','wood','metal','petrol'];
 foreach($keys as $i=>$key)if(($res[$i]??0)<(int)$cost[$key])json_out(['ok'=>false,'result'=>'not_enough','message'=>'Not enough resources.','slot'=>$slot]);
 foreach($keys as $i=>$key)$res[$i]-=(int)$cost[$key];$rs=$db->real_escape_string(implode('|',$res));
 $now=time();
 $db->begin_transaction();try{$db->query("UPDATE strongholds SET ressis='$rs' WHERE userid=$uid");$db->query("INSERT INTO emplacements(userid,type,grid_x,grid_y,level,built_at) VALUES($uid,$slot,$gridX,$gridY,1,$now)");$db->commit();}catch(Throwable $e){$db->rollback();throw$e;}
 json_out(['ok'=>true,'result'=>'emplaced','message'=>'Emplacement raised.','slot'=>$slot]);
}
if(zv2_active_builds($uid))json_out(['ok'=>false,'result'=>'build_busy','message'=>'Another construction project is already active.','slot'=>$slot]);
$r=$db->query('SELECT buildings,ressis FROM strongholds WHERE userid='.$uid.' LIMIT 1'); if(!$r||!$r->num_rows)json_err('no_stronghold','Stronghold not found.',404);
$s=$r->fetch_assoc();$levels=pipe_nums($s['buildings']);$next=(int)($levels[$slot]??0)+1;
$placing=$next===1;if($placing){zv2_ensure_compound($uid);if($gridX<0||$gridX>=ZV2_GRID_W||$gridY<0||$gridY>=ZV2_GRID_H)json_out(['ok'=>false,'result'=>'bad_plot','message'=>'Choose an empty compound plot.','slot'=>$slot]);$occupied=$db->query("SELECT slot FROM facility_positions WHERE userid=$uid AND grid_x=$gridX AND grid_y=$gridY LIMIT 1");if($occupied&&$occupied->num_rows)json_out(['ok'=>false,'result'=>'plot_occupied','message'=>'That compound plot is occupied.','slot'=>$slot]);
 // Houses and gates are terrain: they hold their cell against construction, which
 // is what forces a player to build around the existing streets.
 $blocked=$db->query("SELECT kind FROM compound_structures WHERE userid=$uid AND grid_x=$gridX AND grid_y=$gridY LIMIT 1");
 if($blocked&&$blocked->num_rows){$k=$blocked->fetch_assoc()['kind'];json_out(['ok'=>false,'result'=>'plot_blocked','message'=>$k==='house'?'A house already stands there.':'That is a gateway — keep it clear.','slot'=>$slot]);}$existing=$db->query("SELECT slot FROM facility_positions WHERE userid=$uid AND slot=$slot LIMIT 1");if($existing&&$existing->num_rows)json_out(['ok'=>false,'result'=>'already_placed','message'=>'That facility already has a plot.','slot'=>$slot]);}
$c=$db->query("SELECT water,food,wood,metal,petrol,duration FROM facility_costs WHERE facility_id=$slot AND level=$next LIMIT 1");
if(!$c||!$c->num_rows)json_out(['ok'=>false,'result'=>'max_level','message'=>'This facility cannot be upgraded further.','slot'=>$slot]);
$cost=$c->fetch_assoc();$res=pipe_nums($s['ressis']);$keys=['water','food','wood','metal','petrol'];
foreach($keys as $i=>$key)if(($res[$i]??0)<(int)$cost[$key])json_out(['ok'=>false,'result'=>'not_enough','message'=>'Not enough resources.','slot'=>$slot]);
foreach($keys as $i=>$key)$res[$i]-=(int)$cost[$key];$rs=$db->real_escape_string(implode('|',$res));
// Adapted Zombilization production factor: Toolshop crew are the "technicians" that
// speed construction (original: duration ÷ factor). Zero crew builds at base speed —
// no 20× stall — each fit Toolshop worker adds 15% (cap +75%), plus research bonus.
$w=$db->query("SELECT COUNT(*) n FROM survivors WHERE userid=$uid AND job_facility=11 AND hp>0 AND fatigue<90");$crew=$w?(int)$w->fetch_assoc()['n']:0;
$speed=zv2_tech_effects($uid)['build_speed']??0;$factor=1+$speed/100+min(.75,.15*$crew);
$duration=max(4,(int)ceil((int)$cost['duration']/$factor));$due=time()+$duration;
$db->begin_transaction();try{$db->query("UPDATE strongholds SET ressis='$rs' WHERE userid=$uid");if($placing)$db->query("INSERT INTO facility_positions(userid,slot,grid_x,grid_y) VALUES($uid,$slot,$gridX,$gridY)");$db->query("INSERT INTO builds(userid,slot,to_level,due) VALUES($uid,$slot,$next,$due)");$db->commit();}catch(Throwable $e){$db->rollback();throw$e;}
json_out(['ok'=>true,'result'=>'ok_upgrading','message'=>'Construction started.','slot'=>$slot,'due'=>$due]);
