<?php
// Item catalog for client-side tooltips (OG getitemmouseover2: name, category,
// weight, every non-zero stat, indoor/outdoor weapon values). Static data —
// no session state beyond auth.
require __DIR__ . '/_bootstrap.php';global $db;api_require_user();
$items=[];$r=$db->query('SELECT id,name,category,attack_bonus,healing,ammo_item,max_durability,repair_amount,defense_bonus FROM items ORDER BY id');
while($r&&($i=$r->fetch_assoc())){
    $id=(int)$i['id'];
    $items[]=[
        'id'=>$id,'name'=>$i['name'],'category'=>$i['category'],
        'weight'=>zv2_item_weight($id),
        'attackBonus'=>(int)$i['attack_bonus'],'defenseBonus'=>(int)$i['defense_bonus'],
        'healing'=>(int)$i['healing'],'repairAmount'=>(int)$i['repair_amount'],
        'ammoItem'=>$i['ammo_item']===null?null:(int)$i['ammo_item'],
        'maxDurability'=>(int)$i['max_durability'],
    ];
}
json_out(['ok'=>true,'items'=>$items]);
