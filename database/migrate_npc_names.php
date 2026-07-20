<?php
require_once __DIR__ . '/../api/_bootstrap.php';global $db;
// Existing people keep their identity. Only encounters the player has not yet
// discovered are assigned names from the original Zombilization pool.
$users=$db->query("SELECT DISTINCT userid FROM recruit_encounters WHERE found_at=0 ORDER BY userid");
while($users&&($u=$users->fetch_assoc())){$uid=(int)$u['userid'];$pool=array_slice(zv2_npc_names($uid,12),2);$encounters=$db->query("SELECT id FROM recruit_encounters WHERE userid=$uid AND found_at=0 ORDER BY id");$i=0;while($encounters&&($e=$encounters->fetch_assoc())){$name=$db->real_escape_string($pool[$i%count($pool)]);$db->query("UPDATE recruit_encounters SET name='$name' WHERE id=".(int)$e['id']." AND userid=$uid AND found_at=0");$i++;}}
echo "Original Z NPC names migration complete.\n";
