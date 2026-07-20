<?php
require __DIR__ . '/_bootstrap.php';global $db;$uid=api_require_user();if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST')json_err('method','POST required',405);
$x=(int)($_POST['x']??0);$y=(int)($_POST['y']??0);$roomId=(int)($_POST['room']??0);$action=(string)($_POST['action']??'');$squadId=(int)($_POST['squad']??0);if($x<1||$x>50||$y<1||$y>50||$roomId<=0)json_err('bad_room','Invalid room.');if(!zv2_is_seen($uid,$x,$y))json_err('not_discovered','Explore this place first.',403);$activeSquad=zv2_squad($uid,$squadId);if($activeSquad['traveling']||$activeSquad['x']!==$x||$activeSquad['y']!==$y)json_err('squad_elsewhere','The selected squad must be at this building.');if(!$activeSquad['crew'])json_err('no_crew','This squad has no members.');$crewSql=implode(',',array_map('intval',$activeSquad['crew']));$gearAttack=(int)$activeSquad['equipment']['perMemberAttack'];$gearDefense=(int)$activeSquad['equipment']['perMemberDefense'];
$rr=$db->query("SELECT r.id,r.buildingid,r.inventory,r.zombies FROM roommap r JOIN buildings b ON b.id=r.buildingid WHERE r.id=$roomId AND b.x=$x AND b.y=$y LIMIT 1");if(!$rr||!$rr->num_rows)json_err('no_room','That room does not belong to this location.',404);$room=$rr->fetch_assoc();$bid=(int)$room['buildingid'];$techEffects=zv2_tech_effects($uid);$db->query("INSERT IGNORE INTO building_runs(userid,building_id) VALUES($uid,$bid)");
// Zombie groups are encoded "type|count|frontHp" — frontHp tracks the wounded
// lead zombie of the group (original tracked every zombie's HP per fight round).
function ztype(int $id):array{global $db;static $cache=[];if(isset($cache[$id]))return$cache[$id];$r=$db->query("SELECT name,threat,hp,attack,defense,speed,drops FROM zombietypes WHERE id=$id LIMIT 1");$cache[$id]=$r&&$r->num_rows?$r->fetch_assoc():['name'=>'Zombie','threat'=>1,'hp'=>10,'attack'=>5,'defense'=>5,'speed'=>1,'drops'=>''];return$cache[$id];}
function groups(string $encoded):array{$out=[];foreach(explode('&',$encoded)as$e){if($e==='')continue;$b=explode('|',$e);$t=(int)($b[0]??0);$n=max(0,(int)($b[1]??0));if(!$t||!$n)continue;$zt=ztype($t);$front=isset($b[2])?max(1,(int)$b[2]):(int)$zt['hp'];$out[]=['type'=>$t,'count'=>$n,'front'=>$front,'z'=>$zt];}return$out;}
function encode_groups(array $groups):string{$alive=array_values(array_filter($groups,fn($g)=>$g['count']>0));return implode('&',array_map(fn($g)=>$g['type'].'|'.$g['count'].'|'.$g['front'],$alive));}
function threat(array $groups):array{$n=0;$t=0;foreach($groups as$g){if($g['count']<=0)continue;$n+=$g['count'];$t+=$g['count']*(int)$g['z']['threat'];}return[$n,$t];}
function add_room_item(string $encoded,int $item,int $amount):string{$entries=[];$found=false;foreach(explode('&',$encoded)as$e){if($e==='')continue;$b=explode('|',$e);$id=(int)($b[0]??0);$n=(int)($b[1]??0);if($id===$item){$n+=$amount;$found=true;}$entries[]=$id.'|'.$n;}if(!$found)$entries[]=$item.'|'.$amount;return implode('&',$entries);}
function momentum(int $uid,int $bid,int $gain):array{global $db;$r=$db->query("SELECT momentum,reward_tier FROM building_runs WHERE userid=$uid AND building_id=$bid FOR UPDATE");$run=$r->fetch_assoc();$value=min(15,(int)$run['momentum']+$gain);$tier=(int)floor($value/5);$old=(int)$run['reward_tier'];$reward=null;if($tier>$old){$item=[1,5,6][($bid+$tier)%3];$amount=$item===6?4:1;zv2_add_item($uid,$item,$amount);$reward=['name'=>zv2_item_name($item),'amount'=>$amount,'tier'=>$tier];}$db->query("UPDATE building_runs SET momentum=$value,reward_tier=GREATEST(reward_tier,$tier) WHERE userid=$uid AND building_id=$bid");return['value'=>$value,'nextReward'=>($tier+1)*5,'reward'=>$reward];}
function noise(int $uid,int $bid,int $gain):int{global $db;$db->query("UPDATE building_runs SET noise=LEAST(12,noise+$gain) WHERE userid=$uid AND building_id=$bid");return(int)$db->query("SELECT noise FROM building_runs WHERE userid=$uid AND building_id=$bid")->fetch_assoc()['noise'];}

if($action==='discover'){
 $known=$db->query("SELECT discovered FROM room_progress WHERE userid=$uid AND room_id=$roomId LIMIT 1");if($known&&$known->num_rows&&(int)$known->fetch_assoc()['discovered'])json_err('already_discovered','This room is already mapped.');
 $prev=$db->query("SELECT r.id,r.zombies,COALESCE(p.discovered,0) discovered FROM roommap r LEFT JOIN room_progress p ON p.room_id=r.id AND p.userid=$uid WHERE r.buildingid=$bid AND r.id<$roomId ORDER BY r.id DESC LIMIT 1");if($prev&&$prev->num_rows){$p=$prev->fetch_assoc();if(!(int)$p['discovered']||(string)$p['zombies']!=='')json_err('route_blocked','Secure the previous room first.');}
 $approach=(string)($_POST['approach']??'quiet');if(!in_array($approach,['quiet','careful','breach'],true))json_err('bad_approach','Choose an entry approach.');$intel=($approach==='careful'?3:($approach==='quiet'?2:0))+(int)($techEffects['intel_bonus']??0);if($approach==='careful'&&zv2_item_owned($uid,26)>0)$intel++;$gain=$approach==='breach'?2:1;$event='';
 if($approach==='careful'){$bonus=[1,2,5,6][($roomId+$uid)%4];$newInv=add_room_item((string)$room['inventory'],$bonus,1);$esc=$db->real_escape_string($newInv);$db->query("UPDATE roommap SET inventory='$esc' WHERE id=$roomId");$event='Careful scouting uncovered bonus salvage.';}
 if($approach==='breach'){$sv=$db->query("SELECT id,name FROM survivors WHERE userid=$uid AND id IN ($crewSql) AND hp>0 AND fatigue<90 AND job_facility IS NULL ORDER BY fatigue,id LIMIT 1");if(!$sv||!$sv->num_rows)json_err('no_breacher','No survivor in this squad is available to breach.');$s=$sv->fetch_assoc();$ambush=(string)$room['zombies']!==''?1:0;$db->query("UPDATE survivors SET hp=GREATEST(0,hp-$ambush),fatigue=LEAST(100,fatigue+10) WHERE id=".(int)$s['id']);$event=$ambush?$s['name'].' took 1 ambush damage.':$s['name'].' smashed through uncontested.';}
 $approachEsc=$db->real_escape_string($approach);$db->query("INSERT INTO room_progress(userid,room_id,discovered,intel,approach,discovered_at) VALUES($uid,$roomId,1,$intel,'$approachEsc',".time().") ON DUPLICATE KEY UPDATE discovered=1,intel=$intel,approach='$approachEsc',discovered_at=VALUES(discovered_at)");$m=momentum($uid,$bid,$gain);$n=noise($uid,$bid,$approach==='breach'?4:($approach==='careful'?1:0));json_out(['ok'=>true,'action'=>'discover','approach'=>$approach,'intel'=>$intel,'momentum'=>$m,'noise'=>$n,'message'=>ucfirst($approach).' entry complete. '.$event.($n>=6?' The building is dangerously loud.':'')]);
}

$pr=$db->query("SELECT intel FROM room_progress WHERE userid=$uid AND room_id=$roomId AND discovered=1 LIMIT 1");if(!$pr||!$pr->num_rows)json_err('room_unknown','Discover this room before acting inside it.');$progress=$pr->fetch_assoc();
if($action==='retreat'){
 // Original fleefight: a speed contest of d20s against a zombie (zombie base speed 1).
 // Success disengages; failure means the infected get a free strike and you stay.
 $z=groups((string)$room['zombies']);[$remaining]=threat($z);if($remaining<=0)json_err('already_clear','There is nothing to retreat from.');
 $troopRoll=3+mt_rand(1,20);$zombieRoll=1+mt_rand(1,20);
 if($troopRoll>$zombieRoll)json_out(['ok'=>true,'action'=>'retreat','remaining'=>$remaining,'retreated'=>true,'message'=>"The squad broke away ($troopRoll vs $zombieRoll). The room remains infected."]);
 $victim=$db->query("SELECT id,name,hp,defense_stat FROM survivors WHERE userid=$uid AND id IN ($crewSql) AND hp>0 ORDER BY fatigue,id LIMIT 1");
 $hit='';if($victim&&$victim->num_rows){$v=$victim->fetch_assoc();$sum=0;foreach($z as$g)for($i=0;$i<$g['count'];$i++){$d=((int)$g['z']['attack']+mt_rand(1,20))-((int)$v['defense_stat']+$gearDefense+mt_rand(1,20));if($d>0)$sum+=$d;}
  $dmg=min((int)$v['hp'],max(0,(int)ceil($sum/3)));if($dmg>0){$db->query("UPDATE survivors SET hp=GREATEST(0,hp-$dmg),fatigue=LEAST(100,fatigue+8) WHERE id=".(int)$v['id']);$hit=' '.$v['name'].' took '.$dmg.' damage in the scramble.';}}
 json_out(['ok'=>true,'action'=>'retreat','remaining'=>$remaining,'retreated'=>false,'message'=>"Too slow ($troopRoll vs $zombieRoll) — the infected caught the squad.".$hit]);
}
if($action==='fight'){
 $survivorId=(int)($_POST['survivor']??0);if(!in_array($survivorId,$activeSquad['crew'],true))json_err('not_in_squad','Choose a fighter from the selected squad.');$tactic=(string)($_POST['tactic']??'precise');if(!in_array($tactic,['precise','aggressive','guarded'],true))$tactic='precise';$sr=$db->query("SELECT s.id,s.name,s.hp,s.max_hp,s.attack_stat,s.defense_stat,s.equipped_weapon,s.job_facility,s.fatigue,i.name weapon,i.attack_bonus,i.ammo_item,i.max_durability,COALESCE(v.durability,i.max_durability) durability,COALESCE(a.amount,0) ammo FROM survivors s LEFT JOIN items i ON i.id=s.equipped_weapon LEFT JOIN inventory v ON v.userid=s.userid AND v.item_id=s.equipped_weapon LEFT JOIN inventory a ON a.userid=s.userid AND a.item_id=i.ammo_item WHERE s.id=$survivorId AND s.userid=$uid LIMIT 1");if(!$sr||!$sr->num_rows)json_err('bad_survivor','Choose one of your survivors.');$sv=$sr->fetch_assoc();if((int)$sv['hp']<=0)json_err('survivor_down',$sv['name'].' is unable to fight.');if($sv['job_facility']!==null)json_err('survivor_working',$sv['name'].' must leave facility duty first.');if((float)$sv['fatigue']>=90)json_err('survivor_exhausted',$sv['name'].' is too exhausted to fight.');
 // === Original Zombilization D20 combat (zombiefunctions.php fightinround port) ===
 // damage = (ATT + d20) − (DEF + d20); miss on ≤0. One attack strikes the lead
 // zombie of the front group; then every living zombie strikes back (their summed
 // rolls ÷3 = Zv2 survivor-scale adaptation of the original troop-scale numbers).
 // Indoors: melee weapons ×3, firearms ×⅔ (original startzombiefight modifiers).
 // Stances map to the original: aggressive=berserk/sniper (ATT×4/3, DEF×⅔),
 // guarded=defensive (ATT×⅔, DEF×4/3), precise=normal.
 $z=groups((string)$room['zombies']);[$total]=threat($z);if(!$total)json_err('already_clear','This room is already clear.');$condition=(int)($sv['durability']??0);$needsAmmo=(int)($sv['ammo_item']??0)>0;$weaponUsed=(int)($sv['equipped_weapon']??0)>0&&$condition>0&&(!$needsAmmo||(int)$sv['ammo']>0);
 $wBonus=0;if($weaponUsed){$isMelee=$sv['ammo_item']===null;$wBonus=$isMelee?(int)$sv['attack_bonus']*3:(int)floor((int)$sv['attack_bonus']*2/3);}
 $intel=min(4,(int)$progress['intel']);
 $att=(float)((int)$sv['attack_stat']+$wBonus+$gearAttack+$intel+(int)($techEffects['combat_bonus']??0));
 $def=(float)((int)$sv['defense_stat']+$gearDefense);
 if($tactic==='aggressive'){$att=$att*4/3;$def=$def*2/3;}elseif($tactic==='guarded'){$att=$att*2/3;$def=$def*4/3;}
 // --- survivor's strike on the front group's lead zombie
 $front=null;foreach($z as$i=>$g)if($g['count']>0){$front=$i;break;}
 $d1=mt_rand(1,20);$d2=mt_rand(1,20);$zg=&$z[$front];
 $dmg=(int)round($att+$d1-((int)$zg['z']['defense']+$d2));$killed=0;$drops=[];
 $strike=$dmg<=0?"missed ($d1 vs $d2)":null;
 if($dmg>0){$zg['front']-=$dmg;$strike="hit the ".$zg['z']['name']." for $dmg ($d1 vs $d2)";
  if($zg['front']<=0){$zg['count']--;$killed=1;$strike.=' — killed!';$zg['front']=(int)$zg['z']['hp'];
   foreach(explode('&',(string)$zg['z']['drops'])as$dEntry){if($dEntry==='')continue;$bits=explode('|',$dEntry);$dItem=(int)($bits[0]??0);$dQty=(int)($bits[1]??0);if(!$dItem||!$dQty)continue;$roll=(int)round(mt_rand(0,100)*$dQty/100);if($roll>0){$room['inventory']=add_room_item((string)$room['inventory'],$dItem,$roll);$drops[]=$roll.'× '.zv2_item_name($dItem);}}
  }}
 unset($zg);
 // --- zombies' round: every living zombie rolls against the acting survivor
 [$remaining,$danger]=threat($z);$currentNoise=(int)$db->query("SELECT noise FROM building_runs WHERE userid=$uid AND building_id=$bid")->fetch_assoc()['noise'];
 $sum=0;foreach($z as$g)for($i=0;$i<$g['count'];$i++){$zd=((int)$g['z']['attack']+mt_rand(1,20))-($def+mt_rand(1,20));if($zd>0)$sum+=$zd;}
 $damage=$remaining?max(0,(int)ceil($sum/3)+(int)floor($currentNoise/5)):0;
 $fatigue=$tactic==='aggressive'?12:($tactic==='guarded'?5:8);$newHp=max(0,(int)$sv['hp']-$damage);
 $ze=$db->real_escape_string(encode_groups($z));$inv=$db->real_escape_string((string)$room['inventory']);
 $newCondition=$weaponUsed?max(0,$condition-1):$condition;$newAmmo=$needsAmmo&&$weaponUsed?max(0,(int)$sv['ammo']-1):(int)$sv['ammo'];$m=null;
 $db->begin_transaction();try{$db->query("UPDATE roommap SET zombies='$ze',inventory='$inv' WHERE id=$roomId");$db->query("UPDATE survivors SET hp=$newHp,fatigue=LEAST(100,fatigue+$fatigue) WHERE id=$survivorId AND userid=$uid");if($killed)$db->query("UPDATE strongholds SET kills=kills+$killed WHERE userid=$uid");$db->query("UPDATE room_progress SET intel=GREATEST(0,intel-1) WHERE userid=$uid AND room_id=$roomId");if($weaponUsed){$wid=(int)$sv['equipped_weapon'];$db->query("UPDATE inventory SET durability=$newCondition WHERE userid=$uid AND item_id=$wid");if($needsAmmo){$aid=(int)$sv['ammo_item'];$db->query("UPDATE inventory SET amount=amount-1 WHERE userid=$uid AND item_id=$aid AND amount>0");$db->query("DELETE FROM inventory WHERE userid=$uid AND item_id=$aid AND amount<=0");}}if($remaining===0)$m=momentum($uid,$bid,$tactic==='aggressive'?3:($tactic==='guarded'?1:2));$db->commit();}catch(Throwable$e){$db->rollback();throw$e;}
 $n=noise($uid,$bid,$tactic==='aggressive'?4:($tactic==='precise'?1:0));
 $message=$sv['name'].' '.$strike.'.';if($drops)$message.=' Dropped: '.implode(', ',$drops).'.';if($damage)$message.=" Counterattack: $damage damage taken.";elseif($remaining)$message.=' The squad evaded the counterattack.';
 if($remaining===0)$message.=' Room secured!';if($n>=6)$message.=' Noise is attracting nearby infected.';if($m&&$m['reward'])$message.=' Supply cache earned: '.$m['reward']['amount'].'× '.$m['reward']['name'].'.';
 json_out(['ok'=>true,'action'=>'fight','tactic'=>$tactic,'killed'=>$killed,'strike'=>$strike,'rolls'=>['attack'=>$d1,'defense'=>$d2],'drops'=>$drops,'remaining'=>$remaining,'secured'=>$remaining===0,'noise'=>$n,'squadGear'=>['attack'=>$gearAttack,'defense'=>$gearDefense],'survivor'=>['id'=>$survivorId,'name'=>$sv['name'],'hp'=>$newHp,'maxHp'=>(int)$sv['max_hp'],'damage'=>$damage,'fatigue'=>$fatigue],'weapon'=>['used'=>$weaponUsed,'name'=>$sv['weapon'],'durability'=>$newCondition,'maxDurability'=>(int)($sv['max_durability']??0),'ammo'=>$newAmmo],'momentum'=>$m,'message'=>$message]);
}
if($action==='loot'){
 if((string)$room['zombies']!=='')json_err('room_infected','Clear the zombies before scavenging.');$itemId=(int)($_POST['item']??0);$available=0;foreach(explode('&',(string)$room['inventory'])as$e){$b=explode('|',$e);if((int)($b[0]??0)===$itemId)$available=max(0,(int)($b[1]??0));}if(!$available)json_err('item_gone','That item is no longer here.');
 $bonus=in_array($itemId,[1,2],true)&&($techEffects['salvage_bonus']??0)>0?max(1,(int)floor($available*$techEffects['salvage_bonus']/100)):0;$taken=zv2_add_cargo($activeSquad['id'],$itemId,$available+$bonus);if($taken<=0)json_err('cargo_full','The squad cannot carry any more. Return to the stronghold or leave something behind.');$actual=min($available,$taken);$remaining=$available-$actual;$left=[];foreach(explode('&',(string)$room['inventory'])as$e){if($e==='')continue;$b=explode('|',$e);if((int)($b[0]??0)===$itemId){if($remaining>0)$left[]=$itemId.'|'.$remaining;}else$left[]=$e;}$esc=$db->real_escape_string(implode('&',$left));$db->query("UPDATE roommap SET inventory='$esc' WHERE id=$roomId");if($itemId===8)$db->query("UPDATE research_state SET points=LEAST(9999,points+".($actual*5).") WHERE userid=$uid");$cargo=zv2_squad_cargo($activeSquad['id']);$message='Packed '.$taken.'× '.zv2_item_name($itemId).' into squad cargo.';if($taken<$available+$bonus)$message.=' Capacity reached; some supplies remain.';if($itemId===8)$message.=' Electronics yielded '.($actual*5).' research points.';$me=$db->real_escape_string($message);$db->query("INSERT INTO squad_events(squad_id,event_type,message,created_at) VALUES(".(int)$activeSquad['id'].",'loot','$me',".time().")");json_out(['ok'=>true,'action'=>'loot','item'=>['id'=>$itemId,'name'=>zv2_item_name($itemId),'amount'=>$taken,'remaining'=>$remaining],'cargo'=>$cargo,'message'=>$message]);
}
if($action==='claim_vehicle'){
 // Original: unmanned vehicles sit in world rooms; a troop simply drives off with
 // one (movetrooptovehicle). Requires the room to be clear of infected.
 if((string)$room['zombies']!=='')json_err('room_infected','Clear the zombies before taking the vehicle.');
 $vid=(int)($_POST['item']??0);$vr=$db->query("SELECT wv.*,vt.name tname,vt.fuel_capacity FROM world_vehicles wv JOIN vehicle_types vt ON vt.id=wv.type_id WHERE wv.id=$vid AND wv.room_id=$roomId AND wv.claimed_by IS NULL LIMIT 1");
 if(!$vr||!$vr->num_rows)json_err('no_vehicle','That vehicle is gone.');$veh=$vr->fetch_assoc();
 $db->begin_transaction();try{
  $db->query("UPDATE world_vehicles SET claimed_by=$uid,claimed_at=".time()." WHERE id=$vid AND claimed_by IS NULL");
  if($db->affected_rows<1)throw new RuntimeException('raced');
  $nm=$db->real_escape_string((string)$veh['tname']);
  $db->query("INSERT INTO vehicles(userid,type_id,name,fuel,created_at) VALUES($uid,".(int)$veh['type_id'].",'$nm',".(int)$veh['fuel'].",".time().")");
  $db->commit();
 }catch(RuntimeException$e){$db->rollback();json_err('no_vehicle','Someone already drove it away.');}catch(Throwable$e){$db->rollback();throw$e;}
 json_out(['ok'=>true,'action'=>'claim_vehicle','vehicle'=>['type'=>(int)$veh['type_id'],'name'=>$veh['tname'],'fuel'=>(int)$veh['fuel']],'message'=>'The squad recovered the abandoned '.$veh['tname'].' ('.(int)$veh['fuel'].' fuel left). It is waiting at the Garage.']);
}
json_err('bad_action','Unknown room action.');
