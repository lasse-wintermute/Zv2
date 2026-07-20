<?php
// Facility activity throttle — the OG `activebuildings` / setactivity(): a
// percentage per facility that scales its power draw, its production and its
// job capacity together. Only `outputadjustable` facilities accept it.
require __DIR__ . '/_bootstrap.php';global $db;$uid=api_require_user();
if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST')json_err('method','POST required',405);
$slot=(int)($_POST['slot']??0);$percent=(int)($_POST['percent']??100);
if(!in_array($slot,ZV2_ADJUSTABLE,true))json_err('not_adjustable','That facility cannot be throttled.');
$percent=max(0,min(100,$percent));
zv2_refresh($uid);   // settle production at the OLD rate before changing it
$r=$db->query("SELECT buildings,activebuildings FROM strongholds WHERE userid=$uid LIMIT 1");
if(!$r||!$r->num_rows)json_err('no_stronghold','Stronghold not found.',404);
$s=$r->fetch_assoc();
if((int)(pipe_nums($s['buildings'])[$slot]??0)<1)json_err('not_built','Build that facility first.');
$a=pipe_nums($s['activebuildings']);for($i=0;$i<=45;$i++)if(!isset($a[$i]))$a[$i]=1;
$a[$slot]=round($percent/100,2);
$esc=$db->real_escape_string(implode('|',$a));
$db->query("UPDATE strongholds SET activebuildings='$esc' WHERE userid=$uid");
$fn=$db->query("SELECT name FROM facilities WHERE id=$slot LIMIT 1");
$name=$fn&&$fn->num_rows?$fn->fetch_assoc()['name']:'Facility';
json_out(['ok'=>true,'slot'=>$slot,'percent'=>$percent,'message'=>$name.' running at '.$percent.'%.']);
