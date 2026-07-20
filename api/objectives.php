<?php
// Objectives — the original quests_tasks chains adapted to Zv2. GET lists all
// chains with live progress; POST {claim:id} grants the reward once per player.
require __DIR__ . '/_bootstrap.php';global $db;$uid=api_require_user();zv2_refresh($uid);

$hold=$db->query("SELECT buildings,kills FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();
$levels=pipe_nums($hold['buildings']);$kills=(int)$hold['kills'];
$alive=(int)$db->query("SELECT COUNT(*) n FROM survivors WHERE userid=$uid AND hp>0")->fetch_assoc()['n'];
$techs=[];$tr=$db->query("SELECT tech_id FROM player_research WHERE userid=$uid");while($tr&&($t=$tr->fetch_assoc()))$techs[(int)$t['tech_id']]=true;
$claimed=[];$cr=$db->query("SELECT objective_id FROM player_objectives WHERE userid=$uid");while($cr&&($c=$cr->fetch_assoc()))$claimed[(int)$c['objective_id']]=true;

// AND-ed requirement check with human-readable progress fragments.
function obj_progress(array $o,array $levels,array $techs,int $kills,int $alive):array{
    global $db;$parts=[];$done=true;
    if($o['req_facility']!==null){$have=(int)($levels[(int)$o['req_facility']]??0);$need=(int)$o['req_level'];$fr=$db->query("SELECT name FROM facilities WHERE id=".(int)$o['req_facility']." LIMIT 1");$fn=$fr&&$fr->num_rows?$fr->fetch_assoc()['name']:'Facility';$parts[]=['label'=>$fn.' L'.$need,'have'=>min($have,$need),'need'=>$need,'done'=>$have>=$need];if($have<$need)$done=false;}
    if($o['req_tech']!==null){$tid=(int)$o['req_tech'];$tn=$db->query("SELECT name FROM technologies WHERE id=$tid LIMIT 1");$name=$tn&&$tn->num_rows?$tn->fetch_assoc()['name']:'Technology';$ok=isset($techs[$tid]);$parts[]=['label'=>$name,'have'=>$ok?1:0,'need'=>1,'done'=>$ok];if(!$ok)$done=false;}
    if($o['req_kills']!==null){$need=(int)$o['req_kills'];$parts[]=['label'=>'Infected killed','have'=>min($kills,$need),'need'=>$need,'done'=>$kills>=$need];if($kills<$need)$done=false;}
    if($o['req_survivors']!==null){$need=(int)$o['req_survivors'];$parts[]=['label'=>'Living survivors','have'=>min($alive,$need),'need'=>$need,'done'=>$alive>=$need];if($alive<$need)$done=false;}
    return[$done,$parts];
}

if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
    $id=(int)($_POST['claim']??0);$or=$db->query("SELECT * FROM objectives WHERE id=$id LIMIT 1");if(!$or||!$or->num_rows)json_err('bad_objective','Unknown objective.');$o=$or->fetch_assoc();
    if(isset($claimed[$id]))json_err('already_claimed','That reward has already been collected.');
    if($o['prereq_id']!==null&&!isset($claimed[(int)$o['prereq_id']]))json_err('chain_locked','Claim the previous objective in this chain first.');
    [$done]=obj_progress($o,$levels,$techs,$kills,$alive);if(!$done)json_err('incomplete','That objective is not complete yet.');
    $db->begin_transaction();try{
        $db->query("INSERT INTO player_objectives(userid,objective_id,claimed_at) VALUES($uid,$id,".time().")");
        zv2_add_item($uid,(int)$o['reward_item'],(int)$o['reward_amount']);
        $db->query("UPDATE strongholds SET points=points+".(5*(int)$o['tier'])." WHERE userid=$uid");
        $db->commit();
    }catch(Throwable$e){$db->rollback();throw$e;}
    json_out(['ok'=>true,'claimed'=>$id,'reward'=>['item'=>(int)$o['reward_item'],'name'=>zv2_item_name((int)$o['reward_item']),'amount'=>(int)$o['reward_amount']],'message'=>$o['name'].' complete! Reward: '.(int)$o['reward_amount'].'× '.zv2_item_name((int)$o['reward_item']).'.']);
}

$chains=[];$r=$db->query("SELECT * FROM objectives ORDER BY chain,tier");
while($r&&($o=$r->fetch_assoc())){
    [$done,$parts]=obj_progress($o,$levels,$techs,$kills,$alive);
    $isClaimed=isset($claimed[(int)$o['id']]);$locked=$o['prereq_id']!==null&&!isset($claimed[(int)$o['prereq_id']]);
    $chains[$o['chain']][]=['id'=>(int)$o['id'],'tier'=>(int)$o['tier'],'name'=>$o['name'],'description'=>$o['description'],'requirements'=>$parts,'reward'=>['item'=>(int)$o['reward_item'],'name'=>zv2_item_name((int)$o['reward_item']),'amount'=>(int)$o['reward_amount']],'complete'=>$done,'claimed'=>$isClaimed,'locked'=>$locked,'claimable'=>$done&&!$isClaimed&&!$locked];
}
$total=0;$claimedCount=0;foreach($chains as$list)foreach($list as$o){$total++;if($o['claimed'])$claimedCount++;}
json_out(['ok'=>true,'kills'=>$kills,'claimed'=>$claimedCount,'total'=>$total,'chains'=>$chains]);
