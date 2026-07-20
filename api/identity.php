<?php
// Renaming and emblems — the OG's stronghold/troop rename forms and its banner
// system (troop banner, ally banner, profilbild), adapted to a curated emblem
// set instead of file uploads.
require __DIR__ . '/_bootstrap.php';global $db;$uid=api_require_user();

const ZV2_EMBLEMS=['🏚','🛡','⚔','🔥','☠','🧭','⚓','🐺','🦅','🐍','🌑','☢','⚙','🔧','🪓','🏹','🎯','🚩','🗝','💀','🧿','⛺','🏭','🚚'];

if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST'){
    $u=$db->query("SELECT username,emblem FROM users WHERE id=$uid LIMIT 1")->fetch_assoc();
    $s=$db->query("SELECT name,emblem FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();
    $squads=[];$r=$db->query("SELECT id,name,emblem FROM squads WHERE userid=$uid ORDER BY id");
    while($r&&($q=$r->fetch_assoc()))$squads[]=['id'=>(int)$q['id'],'name'=>$q['name'],'emblem'=>$q['emblem']?:'🪖'];
    json_out(['ok'=>true,'emblems'=>ZV2_EMBLEMS,
        'player'=>['name'=>$u['username'],'emblem'=>$u['emblem']?:'🧭'],
        'stronghold'=>['name'=>$s['name'],'emblem'=>$s['emblem']?:'🏚'],
        'squads'=>$squads]);
}

$action=(string)($_POST['action']??'');
$name=trim((string)($_POST['name']??''));
$emblem=(string)($_POST['emblem']??'');
if($emblem!==''&&!in_array($emblem,ZV2_EMBLEMS,true))json_err('bad_emblem','Pick one of the available emblems.');

// OG validation: non-empty, length-capped, no duplicate stronghold/troop names.
function zv2_check_name(string $n,int $max):string{
    if($n==='')json_err('empty_name','Enter a name.');
    if(mb_strlen($n)>$max)json_err('long_name','Keep it to '.$max.' characters or fewer.');
    if(preg_match('/[<>]/',$n))json_err('bad_name','Names cannot contain < or >.');
    return $n;
}

if($action==='stronghold'){
    $sets=[];
    if($name!==''){zv2_check_name($name,40);$sets[]="name='".$db->real_escape_string($name)."'";}
    if($emblem!=='')$sets[]="emblem='".$db->real_escape_string($emblem)."'";
    if(!$sets)json_err('nothing','Nothing to change.');
    $db->query("UPDATE strongholds SET ".implode(',',$sets)." WHERE userid=$uid");
    json_out(['ok'=>true,'message'=>'Stronghold updated.']);
}
if($action==='squad'){
    $squad=(int)($_POST['squad']??0);
    $own=$db->query("SELECT id FROM squads WHERE id=$squad AND userid=$uid LIMIT 1");
    if(!$own||!$own->num_rows)json_err('bad_squad','That squad is not yours.');
    $sets=[];
    if($name!==''){zv2_check_name($name,24);
        $dupe=$db->query("SELECT id FROM squads WHERE userid=$uid AND id<>$squad AND name='".$db->real_escape_string($name)."' LIMIT 1");
        if($dupe&&$dupe->num_rows)json_err('duplicate_name','Another squad already uses that name.');
        $sets[]="name='".$db->real_escape_string($name)."'";}
    if($emblem!=='')$sets[]="emblem='".$db->real_escape_string($emblem)."'";
    if(!$sets)json_err('nothing','Nothing to change.');
    $db->query("UPDATE squads SET ".implode(',',$sets)." WHERE id=$squad AND userid=$uid");
    json_out(['ok'=>true,'message'=>'Squad updated.']);
}
if($action==='player'){
    if($emblem==='')json_err('nothing','Pick an emblem.');
    $db->query("UPDATE users SET emblem='".$db->real_escape_string($emblem)."' WHERE id=$uid");
    json_out(['ok'=>true,'message'=>'Emblem updated.']);
}
json_err('bad_action','Unknown identity action.');
