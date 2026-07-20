<?php
// Alliances — foundations ported from the OG (allyfunctions.php): found an ally
// gated on the Communication centre, view its page, rename it, edit the
// description, set its banner emblem, leave, and (founder only) disband.
// Ally points are the OG's sum of member points. Invitations/applications/
// admin ranks/ranking are intentionally not built yet — no multiplayer to use
// them. OG bugs deliberately NOT reproduced: unescaped name check, missing
// rename-uniqueness check, founder-only-can't-leave dead-end handled below.
require __DIR__ . '/_bootstrap.php';global $db;$uid=api_require_user();

const ZV2_ALLY_EMBLEMS=['🛡','⚔','🔥','☠','🐺','🦅','🐍','⚓','🌑','☢','🏹','🎯','🚩','💀','🧿','⛺'];

function zv2_ally_of(int $uid):?array{
    global $db;
    $r=$db->query("SELECT a.* FROM ally_members m JOIN allys a ON a.id=m.ally_id WHERE m.userid=$uid AND a.deleted=0 LIMIT 1");
    return $r&&$r->num_rows?$r->fetch_assoc():null;
}
// OG calculateallypoints(): plain sum of member stronghold points.
function zv2_ally_points(int $allyId):int{
    global $db;
    $r=$db->query("SELECT COALESCE(SUM(s.points),0) p, COUNT(*) n FROM ally_members m JOIN strongholds s ON s.userid=m.userid WHERE m.ally_id=$allyId")->fetch_assoc();
    $db->query("UPDATE allys SET allypoints=".(int)$r['p'].",members=".(int)$r['n']." WHERE id=$allyId");
    return (int)$r['p'];
}
function zv2_ally_payload(int $uid):array{
    global $db;
    $hold=$db->query("SELECT buildings FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();
    $comm=(int)(pipe_nums($hold['buildings'])[6]??0);
    $ally=zv2_ally_of($uid);
    $out=['ok'=>true,'emblems'=>ZV2_ALLY_EMBLEMS,'commLevel'=>$comm,'canFound'=>$comm>=1&&!$ally,'ally'=>null];
    if(!$ally){
        $out['reason']=$comm<1?'Build a Communication center to found an alliance.':'';
        return $out;
    }
    $id=(int)$ally['id'];zv2_ally_points($id);
    $ally=$db->query("SELECT * FROM allys WHERE id=$id LIMIT 1")->fetch_assoc();
    $members=[];$r=$db->query("SELECT m.userid,m.rank_level,m.joined_at,u.username,u.emblem,s.name hold,s.points FROM ally_members m JOIN users u ON u.id=m.userid LEFT JOIN strongholds s ON s.userid=m.userid WHERE m.ally_id=$id ORDER BY m.rank_level DESC,m.joined_at");
    while($r&&($m=$r->fetch_assoc()))$members[]=['id'=>(int)$m['userid'],'name'=>$m['username'],'emblem'=>$m['emblem']?:'🧭','stronghold'=>$m['hold'],'points'=>(int)$m['points'],'rank'=>(int)$m['rank_level'],'joinedAt'=>(int)$m['joined_at'],'isYou'=>(int)$m['userid']===$uid];
    $events=[];$er=$db->query("SELECT message,created_at FROM ally_events WHERE ally_id=$id ORDER BY id DESC LIMIT 20");
    while($er&&($e=$er->fetch_assoc()))$events[]=['message'=>$e['message'],'time'=>(int)$e['created_at']];
    $me=$db->query("SELECT rank_level FROM ally_members WHERE userid=$uid AND ally_id=$id LIMIT 1")->fetch_assoc();
    $out['ally']=['id'=>$id,'name'=>$ally['name'],'emblem'=>$ally['emblem']?:'🛡','description'=>$ally['description'],
        'founder'=>(int)$ally['founder'],'members'=>$members,'points'=>(int)$ally['allypoints'],
        'createdAt'=>(int)$ally['created_at'],'yourRank'=>(int)($me['rank_level']??0),
        'isFounder'=>(int)$ally['founder']===$uid,'isAdmin'=>(int)($me['rank_level']??0)>=1,'events'=>$events];
    return $out;
}
function zv2_ally_log(int $allyId,string $msg):void{global $db;$db->query("INSERT INTO ally_events(ally_id,message,created_at) VALUES($allyId,'".$db->real_escape_string($msg)."',".time().")");}

if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST')json_out(zv2_ally_payload($uid));

$action=(string)($_POST['action']??'');
$name=trim((string)($_POST['name']??''));
$emblem=(string)($_POST['emblem']??'');
$desc=trim((string)($_POST['description']??''));
$ally=zv2_ally_of($uid);
$uname=$db->query("SELECT username FROM users WHERE id=$uid LIMIT 1")->fetch_assoc()['username'];

if($action==='found'){
    if($ally)json_err('have_ally','Leave your current alliance first.');
    $hold=$db->query("SELECT buildings FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();
    if((int)(pipe_nums($hold['buildings'])[6]??0)<1)json_err('no_comm','You need a Communication center to found an alliance.');
    if($name==='')json_err('empty_name','Give the alliance a name.');       // OG allowed empty names — we do not
    if(mb_strlen($name)>40)json_err('long_name','Keep the name to 40 characters or fewer.');
    $dupe=$db->query("SELECT id FROM allys WHERE name='".$db->real_escape_string($name)."' AND deleted=0 LIMIT 1");
    if($dupe&&$dupe->num_rows)json_err('name_taken','An alliance with that name already exists.');
    if($emblem!==''&&!in_array($emblem,ZV2_ALLY_EMBLEMS,true))json_err('bad_emblem','Pick one of the available emblems.');
    $now=time();
    $db->begin_transaction();
    try{
        $db->query("INSERT INTO allys(name,emblem,description,founder,members,created_at) VALUES('".$db->real_escape_string($name)."','".$db->real_escape_string($emblem?:'🛡')."','',$uid,1,$now)");
        $id=(int)$db->insert_id;
        $db->query("INSERT INTO ally_members(userid,ally_id,rank_level,joined_at) VALUES($uid,$id,2,$now)");
        $db->query("UPDATE users SET ally_id=$id WHERE id=$uid");
        $db->commit();
    }catch(Throwable$e){$db->rollback();throw$e;}
    zv2_ally_log($id,$uname.' founded the alliance.');zv2_ally_points($id);
    json_out(['ok'=>true,'message'=>'Alliance "'.$name.'" founded.']+zv2_ally_payload($uid));
}

if(!$ally)json_err('no_ally','You are not in an alliance.');
$id=(int)$ally['id'];
$rank=(int)($db->query("SELECT rank_level FROM ally_members WHERE userid=$uid AND ally_id=$id LIMIT 1")->fetch_assoc()['rank_level']??0);
$isFounder=(int)$ally['founder']===$uid;

if($action==='rename'){
    if($rank<1)json_err('not_admin','Only alliance admins can rename it.');
    if($name==='')json_err('empty_name','Give the alliance a name.');
    if(mb_strlen($name)>40)json_err('long_name','Keep the name to 40 characters or fewer.');
    // the OG skipped this uniqueness check on rename — we keep names unique
    $dupe=$db->query("SELECT id FROM allys WHERE name='".$db->real_escape_string($name)."' AND id<>$id AND deleted=0 LIMIT 1");
    if($dupe&&$dupe->num_rows)json_err('name_taken','An alliance with that name already exists.');
    $db->query("UPDATE allys SET name='".$db->real_escape_string($name)."' WHERE id=$id");
    zv2_ally_log($id,$uname.' renamed the alliance to '.$name.'.');
    json_out(['ok'=>true,'message'=>'Alliance renamed.']+zv2_ally_payload($uid));
}
if($action==='emblem'){
    if($rank<1)json_err('not_admin','Only alliance admins can change the banner.');
    if(!in_array($emblem,ZV2_ALLY_EMBLEMS,true))json_err('bad_emblem','Pick one of the available emblems.');
    $db->query("UPDATE allys SET emblem='".$db->real_escape_string($emblem)."' WHERE id=$id");
    zv2_ally_log($id,$uname.' changed the alliance banner.');
    json_out(['ok'=>true,'message'=>'Banner updated.']+zv2_ally_payload($uid));
}
if($action==='description'){
    if($rank<1)json_err('not_admin','Only alliance admins can edit the charter.');
    if(mb_strlen($desc)>1000)json_err('long_desc','Keep the charter under 1000 characters.');
    $db->query("UPDATE allys SET description='".$db->real_escape_string($desc)."' WHERE id=$id");
    zv2_ally_log($id,$uname.' updated the alliance charter.');
    json_out(['ok'=>true,'message'=>'Charter saved.']+zv2_ally_payload($uid));
}
if($action==='leave'){
    // OG dead-end: the founder could never leave. We let a founder leave once
    // they are the last member, which disbands the alliance instead of stranding it.
    $count=(int)$db->query("SELECT COUNT(*) n FROM ally_members WHERE ally_id=$id")->fetch_assoc()['n'];
    if($isFounder&&$count>1)json_err('founder_cannot_leave','Hand the alliance to another member or disband it.');
    $db->query("DELETE FROM ally_members WHERE userid=$uid AND ally_id=$id");
    $db->query("UPDATE users SET ally_id=NULL WHERE id=$uid");
    if($count<=1)$db->query("UPDATE allys SET deleted=1 WHERE id=$id");
    else{zv2_ally_log($id,$uname.' left the alliance.');zv2_ally_points($id);}
    json_out(['ok'=>true,'message'=>$count<=1?'You disbanded the alliance.':'You left the alliance.']+zv2_ally_payload($uid));
}
if($action==='disband'){
    if(!$isFounder)json_err('not_founder','Only the founder can disband the alliance.');
    $db->query("UPDATE allys SET deleted=1 WHERE id=$id");
    $db->query("UPDATE users SET ally_id=NULL WHERE id IN (SELECT userid FROM ally_members WHERE ally_id=$id)");
    $db->query("DELETE FROM ally_members WHERE ally_id=$id");
    json_out(['ok'=>true,'message'=>'Alliance disbanded.']+zv2_ally_payload($uid));
}
json_err('bad_action','Unknown alliance action.');
