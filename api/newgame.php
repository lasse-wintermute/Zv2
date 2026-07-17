<?php
require __DIR__ . '/_bootstrap.php'; global $db;
if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST')json_err('method','POST required',405);
$name=trim((string)($_POST['name']??''));if(!preg_match("/^[A-Za-z0-9 _'-]{2,20}$/",$name))json_err('bad_name',"Name must be 2–20 characters.");
$esc=$db->real_escape_string($name);$e=$db->query("SELECT id FROM users WHERE username='$esc' LIMIT 1");if($e&&$e->num_rows)json_err('name_taken','That name is already taken.');
$px=random_int(5,46);$py=random_int(5,46);$levels=array_fill(0,46,0);$levels[17]=1;$active=array_fill(0,46,1);
$fog=str_repeat('0',2500);$pos=($px-1)+($py-1)*50;$fog[$pos]='1';$sname=$db->real_escape_string($name."'s Stronghold");$now=time();
$db->begin_transaction();try{
 $db->query("INSERT INTO users(username) VALUES('$esc')");$uid=(int)$db->insert_id;
 $db->query("INSERT INTO strongholds(userid,name,location,ressis,rates,population,buildings,activebuildings,power,last_tick,world_started,last_raid_cycle) VALUES($uid,'$sname','$px|$py','100|100|80|60|20','10|8|6|6|3','5|0|0|0|2|7','".implode('|',$levels)."','".implode('|',$active)."','4|10',$now,$now,0)");
 $db->query("INSERT INTO discovered(userid,data) VALUES($uid,'$fog')");$db->commit();
 $db->query("INSERT INTO research_state(userid,points,last_tick) VALUES($uid,30,$now)");
 $db->query("INSERT INTO tutorial_progress(userid,step,dismissed,updated_at) VALUES($uid,0,0,$now)");
 $db->query("INSERT INTO facility_positions(userid,slot,grid_x,grid_y) VALUES($uid,17,3,3)");
 $lead=$db->real_escape_string($name);$db->query("INSERT INTO survivors(userid,name,hp,max_hp,attack_stat,defense_stat,equipped_weapon) VALUES($uid,'$lead',14,14,4,2,10),($uid,'Mara',12,12,3,2,NULL),($uid,'Jonah',11,11,5,1,NULL)");
 $db->query("INSERT INTO squads(userid,name,x,y) VALUES($uid,'Alpha',$px,$py)");$squadId=(int)$db->insert_id;$members=$db->query("SELECT id FROM survivors WHERE userid=$uid ORDER BY id");while($members&&($m=$members->fetch_assoc()))$db->query("INSERT INTO squad_members(squad_id,survivor_id) VALUES($squadId,".(int)$m['id'].")");
 $recruitNames=['Elena','Marcus','Aisha','Tomas','Nadia','Caleb','Rin','Viktor','Sofia','Malik','Greta','Owen','Inez','Darius','Yara','Felix'];shuffle($recruitNames);$used=["$px|$py"=>true];for($i=0;$i<8;$i++){do{if($i<4){$rx=max(1,min(50,$px+random_int(-6,6)));$ry=max(1,min(50,$py+random_int(-6,6)));}else{$rx=random_int(2,49);$ry=random_int(2,49);}$key="$rx|$ry";}while(isset($used[$key]));$used[$key]=true;$rn=$db->real_escape_string($recruitNames[$i]);$atk=random_int(2,5);$def=random_int(1,3);$db->query("INSERT INTO recruit_encounters(userid,x,y,name,attack_stat,defense_stat) VALUES($uid,$rx,$ry,'$rn',$atk,$def)");}
 zv2_add_item($uid,10,1);
}catch(Throwable$e){$db->rollback();throw$e;}
api_set_user($uid);json_out(['ok'=>true,'player'=>['id'=>$uid,'name'=>$name,'stronghold'=>$name."'s Stronghold"]]);
