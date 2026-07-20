<?php
// GET /api/stronghold — the current player's standalone stronghold,
// pipe-delimited encoding into the clean contract (docs/api-contract.md).
require __DIR__ . '/_bootstrap.php';
/** @var mysqli $db */
global $db;

$uid = api_require_user();
zv2_refresh($uid);

$res = $db->query('SELECT * FROM strongholds WHERE userid = ' . (int) $uid . ' LIMIT 1');
if (!$res || $res->num_rows === 0) json_err('no_stronghold', 'No stronghold for user ' . $uid, 404);
$s = $res->fetch_assoc();

$uname = 'player';
$ur = $db->query('SELECT username FROM users WHERE id = ' . (int) $uid . ' LIMIT 1');
if ($ur && $ur->num_rows) $uname = $ur->fetch_assoc()['username'];

// --- decode compact storage strings ---
$buildings = pipe_nums($s['buildings']);         // 46 facility levels; slot = type-1
$ressis    = pipe_nums($s['ressis']);            // water|food|wood|metal|petrol
$pop       = pipe_nums($s['population']);         // free|sci|tech|troop|scav|total
$power     = pipe_nums($s['power']);              // [0]=used(drain) [1]=generated(output)  (per power.php)
$zuwachs   = pipe_nums($s['rates']);
$active    = pipe_nums($s['activebuildings']);    // per-slot 0..1 operational factor
$loc       = explode('|', $s['location'] ?? '');
$activityMap = zv2_activity((string) $s['activebuildings']);
$effects   = zv2_staff_effects($uid, $buildings, $activityMap);

// resources — food additionally reports production vs consumption (OG net display)
$alive = (int)$db->query("SELECT COUNT(*) n FROM survivors WHERE userid=$uid AND hp>0")->fetch_assoc()['n'];
$foodEaten = round($alive * 3 / 24, 2);   // 3 food per survivor per day
$resKeys = ['water', 'food', 'wood', 'metal', 'petrol'];
$resources = [];
$caps = zv2_storage_caps($buildings);
foreach ($resKeys as $i => $k) {
    $amount  = round($ressis[$i] ?? 0, 1);
    $perHour = round(($zuwachs[$i] ?? 0) * $effects['rate'][$i], 1);
    // Water is the uncapped money-analog slot; show a rounded display cap instead.
    $cap = $caps[$i] >= 1000000000.0 ? max(1000, (float) pow(10, (int) ceil(log10(max($amount, 1))))) : $caps[$i];
    $resources[$k] = ['amount' => $amount, 'cap' => $cap, 'perHour' => $perHour];
    if ($k === 'food') { $resources[$k]['productionPerHour'] = $perHour; $resources[$k]['consumptionPerHour'] = $foodEaten; $resources[$k]['perHour'] = round($perHour - $foodEaten, 1); }
}

// Persistent plots for built facilities and construction sites.
$positions=[];$pq=$db->query("SELECT slot,grid_x,grid_y FROM facility_positions WHERE userid=$uid");while($pq&&($p=$pq->fetch_assoc()))$positions[(int)$p['slot']]=['x'=>(int)$p['grid_x'],'y'=>(int)$p['grid_y']];
$buildRows=zv2_active_builds($uid);$buildSlots=[];foreach($buildRows as$b)$buildSlots[$b['slot']]=$b;
$facilities = [];
for($slot=1;$slot<count($buildings);$slot++) {
    $lvl=(int)($buildings[$slot]??0);if($lvl<=0&&!isset($buildSlots[$slot]))continue;
    $a = $active[$slot] ?? 1;
    $facilities[] = [
        'slot'    => $slot,
        'type'    => $slot,
        'level'   => (int) $lvl,
        'active'  => (float) $a,
        'powered' => $a > 0,          // TODO(P2): derive from the real power grid
        'staff'   => (int)($effects['workers'][$slot] ?? 0),
        'drain'   => zv2_facility_drain($slot, (int) $lvl, $activityMap[$slot] ?? 1.0),
        'adjustable' => in_array($slot, ZV2_ADJUSTABLE, true),
        'gridX'   => (int)($positions[$slot]['x']??3),
        'gridY'   => (int)($positions[$slot]['y']??3),
        'constructing' => $lvl<=0,
    ];
}

// in-progress builds → client countdown timers
$builds = [];
foreach ($buildRows as $b) $builds[] = $b;

// The OG live queue: every running job with its deadline, for the chrome box.
$jobs = [];
foreach ($buildRows as $b) { $fn=$db->query('SELECT name FROM facilities WHERE id='.(int)$b['slot'].' LIMIT 1'); $jobs[]=['type'=>'build','label'=>(($fn&&$fn->num_rows)?$fn->fetch_assoc()['name']:'Facility').' → L'.$b['toLevel'],'due'=>$b['due'],'cancelable'=>true,'ref'=>$b['slot']]; }
$jq=$db->query("SELECT j.due,j.tech_id,t.name FROM research_jobs j JOIN technologies t ON t.id=j.tech_id WHERE j.userid=$uid LIMIT 1");if($jq&&$jq->num_rows){$j=$jq->fetch_assoc();$jobs[]=['type'=>'research','label'=>'Research: '.$j['name'],'due'=>(int)$j['due'],'cancelable'=>true,'ref'=>(int)$j['tech_id']];}
$pq2=$db->query("SELECT p.due,r.name FROM production_jobs p JOIN recipes r ON r.id=p.recipe_id WHERE p.userid=$uid LIMIT 1");if($pq2&&$pq2->num_rows){$j=$pq2->fetch_assoc();$jobs[]=['type'=>'production','label'=>'Toolshop: '.$j['name'],'due'=>(int)$j['due'],'cancelable'=>false];}
$tq=$db->query("SELECT t.due,t.focus,s.name FROM training_jobs t JOIN survivors s ON s.id=t.survivor_id WHERE t.userid=$uid");while($tq&&($j=$tq->fetch_assoc()))$jobs[]=['type'=>'training','label'=>'Training: '.$j['name'].' ('.$j['focus'].')','due'=>(int)$j['due'],'cancelable'=>false];
$hq2=$db->query("SELECT ht.due,s.name FROM hospital_treatments ht JOIN survivors s ON s.id=ht.survivor_id WHERE ht.userid=$uid ORDER BY ht.due");while($hq2&&($j=$hq2->fetch_assoc()))$jobs[]=['type'=>'treatment','label'=>'Hospital: '.$j['name'],'due'=>(int)$j['due'],'cancelable'=>false];
$sq2=$db->query("SELECT name,target_x,target_y,arrives_at FROM squads WHERE userid=$uid AND arrives_at>".time());while($sq2&&($j=$sq2->fetch_assoc()))$jobs[]=['type'=>'travel','label'=>$j['name'].' → '.$j['target_x'].'|'.$j['target_y'],'due'=>(int)$j['arrives_at'],'cancelable'=>false];
usort($jobs,fn($a,$b2)=>$a['due']<=>$b2['due']);

$used = $effects['drain'] ?? ($power[0] ?? 0);
$generated = $effects['power'];
$clock = zv2_world_clock($s);
$clock['threat'] = 5 + min(12, max(0, $clock['day'] - 6)) * 2 + (($uid * 17 + $clock['day'] * 13) % 6);   // keep in sync with zv2_resolve_raid
$clock['defense'] = $effects['defense'];
$clock['lastRaid'] = zv2_latest_raid($uid);

json_out([
    'ok'         => true,
    'apiVersion' => 1,
    'serverTime' => time(),
    'player'     => ['id' => (int) $uid, 'name' => $uname],
    'stronghold' => [
        'id'       => (int) $s['id'],
        'name'     => $s['name'],
        'emblem'   => ($s['emblem'] ?? '') ?: '🏚',
        'level'    => (int) $s['level'],
        'points'   => (int) $s['points'],
        'location' => ['x' => (int) ($loc[0] ?? 0), 'y' => (int) ($loc[1] ?? 0)],
        'resources' => $resources,
        'power'     => ['generated' => round($generated, 1), 'used' => round($used, 1), 'level' => round(($effects['powerLevel'] ?? 1) * 100)],
        'jobs'      => $jobs,
        'survivorsAlive' => $alive,
        'population' => [
            'scientists'  => (int) round($pop[1] ?? 0),
            'technicians' => (int) round($pop[2] ?? 0),
            'troops'      => (int) round($pop[3] ?? 0),
            'scavengers'  => (int) round($pop[4] ?? 0),
            'free'        => (int) round($pop[0] ?? 0),
            'total'       => (int) round($pop[5] ?? 0),
            'cap'         => (int) round($pop[5] ?? 0),
        ],
        'facilities' => $facilities,
        'grid'       => ['w'=>7,'h'=>7],
        'builds'     => $builds,
        'world'      => $clock,
        'staffing'   => ['medical'=>(int)$effects['medical'],'craftDiscount'=>(int)$effects['craftDiscount'],'defense'=>(int)$effects['defense']],
        'gathering'  => ['starterMultiplier'=>(int)($effects['starterBoost']??1),'baseRates'=>array_map('floatval',$zuwachs)],
    ],
]);
