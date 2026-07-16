<?php
require __DIR__ . '/_bootstrap.php'; global $db;
if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST')json_err('method','POST required',405);
$uid=api_require_user(); $slot=(int)($_POST['slot']??0); if($slot<1||$slot>45)json_err('bad_slot','slot must be 1..45');$gridX=isset($_POST['gridX'])?(int)$_POST['gridX']:-1;$gridY=isset($_POST['gridY'])?(int)$_POST['gridY']:-1;
zv2_refresh($uid);
if(zv2_active_builds($uid))json_out(['ok'=>false,'result'=>'build_busy','message'=>'Another construction project is already active.','slot'=>$slot]);
$r=$db->query('SELECT buildings,ressis FROM strongholds WHERE userid='.$uid.' LIMIT 1'); if(!$r||!$r->num_rows)json_err('no_stronghold','Stronghold not found.',404);
$s=$r->fetch_assoc();$levels=pipe_nums($s['buildings']);$next=(int)($levels[$slot]??0)+1;
$placing=$next===1;if($placing){if($gridX<0||$gridX>6||$gridY<0||$gridY>6)json_out(['ok'=>false,'result'=>'bad_plot','message'=>'Choose an empty compound plot.','slot'=>$slot]);$occupied=$db->query("SELECT slot FROM facility_positions WHERE userid=$uid AND grid_x=$gridX AND grid_y=$gridY LIMIT 1");if($occupied&&$occupied->num_rows)json_out(['ok'=>false,'result'=>'plot_occupied','message'=>'That compound plot is occupied.','slot'=>$slot]);$existing=$db->query("SELECT slot FROM facility_positions WHERE userid=$uid AND slot=$slot LIMIT 1");if($existing&&$existing->num_rows)json_out(['ok'=>false,'result'=>'already_placed','message'=>'That facility already has a plot.','slot'=>$slot]);}
$c=$db->query("SELECT water,food,wood,metal,petrol,duration FROM facility_costs WHERE facility_id=$slot AND level=$next LIMIT 1");
if(!$c||!$c->num_rows)json_out(['ok'=>false,'result'=>'max_level','message'=>'This facility cannot be upgraded further.','slot'=>$slot]);
$cost=$c->fetch_assoc();$res=pipe_nums($s['ressis']);$keys=['water','food','wood','metal','petrol'];
foreach($keys as $i=>$key)if(($res[$i]??0)<(int)$cost[$key])json_out(['ok'=>false,'result'=>'not_enough','message'=>'Not enough resources.','slot'=>$slot]);
foreach($keys as $i=>$key)$res[$i]-=(int)$cost[$key];$rs=$db->real_escape_string(implode('|',$res));$speed=zv2_tech_effects($uid)['build_speed']??0;$duration=max(4,(int)ceil((int)$cost['duration']/(1+$speed/100)));$due=time()+$duration;
$db->begin_transaction();try{$db->query("UPDATE strongholds SET ressis='$rs' WHERE userid=$uid");if($placing)$db->query("INSERT INTO facility_positions(userid,slot,grid_x,grid_y) VALUES($uid,$slot,$gridX,$gridY)");$db->query("INSERT INTO builds(userid,slot,to_level,due) VALUES($uid,$slot,$next,$due)");$db->commit();}catch(Throwable $e){$db->rollback();throw$e;}
json_out(['ok'=>true,'result'=>'ok_upgrading','message'=>'Construction started.','slot'=>$slot,'due'=>$due]);
