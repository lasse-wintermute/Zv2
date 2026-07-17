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
$effects   = zv2_staff_effects($uid, $buildings);

// resources
$resKeys = ['water', 'food', 'wood', 'metal', 'petrol'];
$resources = [];
foreach ($resKeys as $i => $k) {
    $amount  = round($ressis[$i] ?? 0, 1);
    $perHour = round(($zuwachs[$i] ?? 0) * $effects['rate'][$i], 1);
    $cap = max(1000, (float) pow(10, (int) ceil(log10(max($amount, 1)))));
    $resources[$k] = ['amount' => $amount, 'cap' => $cap, 'perHour' => $perHour];
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
        'gridX'   => (int)($positions[$slot]['x']??3),
        'gridY'   => (int)($positions[$slot]['y']??3),
        'constructing' => $lvl<=0,
    ];
}

// in-progress builds → client countdown timers
$builds = [];
foreach ($buildRows as $b) $builds[] = $b;

$used = $power[0] ?? 0;
$generated = $power[1] ?? 0;
$generated += $effects['power'];
$clock = zv2_world_clock($s);
$clock['threat'] = 7 + $clock['day'] * 2 + (($uid * 17 + $clock['day'] * 13) % 6);
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
        'level'    => (int) $s['level'],
        'points'   => (int) $s['points'],
        'location' => ['x' => (int) ($loc[0] ?? 0), 'y' => (int) ($loc[1] ?? 0)],
        'resources' => $resources,
        'power'     => ['generated' => round($generated, 1), 'used' => round($used, 1)],
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
