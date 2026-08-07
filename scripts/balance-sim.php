<?php
/**
 * Headless balance harness for the tower-defence compound.
 *
 *   php scripts/balance-sim.php [players] [hours]
 *
 * Drives the REAL rules in api/mechanics.php rather than a copy of them -- a sim
 * built on a restatement of the mechanics balances the restatement, not the game.
 *
 * Runs against a scratch database (zv2_sim) seeded the same way newgame.php seeds
 * a player, so nothing here can touch a real save.
 *
 * Time is simulated by moving world_started and last_tick backwards rather than by
 * waiting: each step rewinds the clock one raid cycle, so zv2_refresh() applies
 * exactly one cycle of production and resolves exactly one wave. Fast-forwarding
 * in one jump would skip every wave in between, because zv2_refresh resolves at
 * most one raid per call.
 */

$PLAYERS = (int)($argv[1] ?? 100);
$HOURS   = (int)($argv[2] ?? 100);

$db = new mysqli('127.0.0.1', 'root', '', 'zv2', 3306);
if ($db->connect_errno) { fwrite(STDERR, "db: {$db->connect_error}\n"); exit(1); }
$GLOBALS['db'] = $db;
function json_err($a, $b, $c = 400) { fwrite(STDERR, "$a: $b\n"); exit(1); }
function pipe_nums($s) { return array_map('floatval', explode('|', (string)$s)); }
require __DIR__ . '/../api/mechanics.php';

// --- scratch database ---------------------------------------------------------
// Clone every table rather than the handful I expect to be touched: the rules
// reach further than is obvious (research jobs, tech effects, item lookups), and
// a missing table surfaces as a fatal three hundred waves into a run.
$db->query("CREATE DATABASE IF NOT EXISTS zv2_sim");
$tables = [];
$r = $db->query("SELECT table_name FROM information_schema.tables WHERE table_schema='zv2'");
while ($r && ($t = $r->fetch_row())) $tables[] = $t[0];
foreach ($tables as $t) {
    $db->query("DROP TABLE IF EXISTS zv2_sim.`$t`");
    $db->query("CREATE TABLE zv2_sim.`$t` LIKE zv2.`$t`");
    // Reference data -- costs, tech tree, item catalogue -- has no owner, and the
    // rules are meaningless without it. Anything keyed by userid starts empty.
    $c = $db->query("SELECT 1 FROM information_schema.columns
                      WHERE table_schema='zv2' AND table_name='$t' AND column_name='userid' LIMIT 1");
    if (!$c || !$c->num_rows) $db->query("INSERT INTO zv2_sim.`$t` SELECT * FROM zv2.`$t`");
}
$db->select_db('zv2_sim');

// --- policies -----------------------------------------------------------------
// Each is a spending order over (facility slot | emplacement type). A bot buys the
// first thing it can afford, so the order IS the strategy.
const STORE = [1 => 'life_support', 2 => 'scrapyard', 3 => 'garage'];
$POLICIES = [
    // Capacity and income first, guns only once the economy carries them.
    'economy'  => [1, 2, 3, 1, 2, 3, 42, 41, 1, 2, 3, 42, 41, 43],
    // Guns first, economy only when nothing military is affordable.
    'turtle'   => [42, 41, 43, 42, 41, 8, 42, 41, 1, 2, 3, 42, 41],
    // Alternating.
    'balanced' => [1, 42, 2, 41, 3, 42, 1, 41, 2, 43, 3, 42, 41],
    // Builds facilities in catalogue order and never defends: the control.
    'naive'    => [1, 2, 3, 4, 6, 9, 10, 11, 12, 13, 16, 18],
];

function cost_of(int $type, int $level): ?array {
    global $db;
    $r = $db->query("SELECT water,food,wood,metal,petrol FROM zv2.facility_costs
                      WHERE facility_id=$type AND level=$level LIMIT 1");
    return $r && $r->num_rows ? array_map('intval', array_values($r->fetch_assoc())) : null;
}

/** Free cell for a gun: on a lane if one is known, so a bot is not simply unlucky. */
function pick_cell(int $uid, array $lanePreference): ?array {
    global $db;
    $taken = [];
    foreach (['compound_structures', 'facility_positions', 'emplacements'] as $t) {
        $q = $db->query("SELECT grid_x,grid_y FROM $t WHERE userid=$uid");
        while ($q && ($r = $q->fetch_assoc())) $taken["{$r['grid_x']}|{$r['grid_y']}"] = true;
    }
    foreach ($lanePreference as [$lx, $ly]) {
        foreach ([[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]] as [$dx,$dy]) {
            $x = $lx + $dx; $y = $ly + $dy;
            if ($x < 1 || $y < 1 || $x >= ZV2_GRID_W - 1 || $y >= ZV2_GRID_H - 1) continue;
            if (!isset($taken["$x|$y"])) return [$x, $y];
        }
    }
    return null;
}

// --- seed ---------------------------------------------------------------------
$now = time();
$policyNames = array_keys($POLICIES);
$players = [];
for ($i = 0; $i < $PLAYERS; $i++) {
    $policy = $policyNames[$i % count($policyNames)];
    $name = sprintf('sim%03d', $i);
    $db->query("INSERT INTO users(username) VALUES('$name')");
    $uid = (int)$db->insert_id;
    $levels = array_fill(0, 46, 0); $levels[17] = 1;
    $active = array_fill(0, 46, 1);
    $db->query("INSERT INTO strongholds(userid,name,location,ressis,rates,population,buildings,activebuildings,power,last_tick,world_started,last_raid_cycle)
                VALUES($uid,'$name','25|25','100|100|80|60|20','10|8|6|6|3','5|0|0|0|2|7','"
                . implode('|', $levels) . "','" . implode('|', $active) . "','4|10',$now,$now,0)");
    $db->query("INSERT INTO facility_positions(userid,slot,grid_x,grid_y) VALUES($uid,17,8,8)");
    $db->query("INSERT INTO survivors(userid,name,hp,max_hp,attack_stat,defense_stat)
                VALUES($uid,'$name lead',14,14,4,2),($uid,'$name a',12,12,3,2),($uid,'$name b',11,11,5,1)");
    $db->query("INSERT INTO research_state(userid,points,last_tick) VALUES($uid,30,$now)");
    zv2_ensure_compound($uid); zv2_ensure_wall($uid);
    $players[] = ['uid' => $uid, 'policy' => $policy, 'step' => 0, 'spent' => 0,
                  'clean' => 0, 'leaked' => 0, 'waves' => 0, 'starved' => 0, 'lanes' => null];
}

$steps = (int)floor($HOURS * 3600 / (ZV2_CYCLE_SECONDS * 3));
fwrite(STDERR, sprintf("%d players x %d h = %d waves each (%d total)\n",
       $PLAYERS, $HOURS, $steps, $PLAYERS * $steps));

// --- run ----------------------------------------------------------------------
$t0 = microtime(true);
for ($step = 1; $step <= $steps; $step++) {
    $cycle = ZV2_CYCLE_SECONDS * 3;
    foreach ($players as &$p) {
        $uid = $p['uid'];
        $now = time();
        $ws = $now - $step * $cycle; $lt = $now - $cycle;
        $db->query("UPDATE strongholds SET world_started=$ws, last_tick=$lt WHERE userid=$uid");
        zv2_refresh($uid);

        // --- spend, in policy order, on the first affordable thing -------------
        $row = $db->query("SELECT ressis,buildings FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc();
        $res = pipe_nums($row['ressis']); $lv = pipe_nums($row['buildings']);
        foreach ($POLICIES[$p['policy']] as $type) {
            $isGun = in_array($type, ZV2_EMPLACEMENT_TYPES, true);
            $level = $isGun ? 1 : (int)($lv[$type] ?? 0) + 1;
            $cost = cost_of($type, $level);
            if (!$cost) continue;
            $afford = true;
            foreach ($cost as $k => $need) if (($res[$k] ?? 0) < $need) { $afford = false; break; }
            if (!$afford) continue;
            foreach ($cost as $k => $need) $res[$k] -= $need;
            if ($isGun) {
                $pref = $p['lanes'] ?: [[intdiv(ZV2_GRID_W, 2), ZV2_GRID_H - 3]];
                $cell = pick_cell($uid, $pref);
                if (!$cell) break;
                $db->query("INSERT INTO emplacements(userid,type,grid_x,grid_y,level,built_at)
                            VALUES($uid,$type,{$cell[0]},{$cell[1]},1,$now)");
                $p['lanes'] = null;                       // layout changed: lanes are stale
            } else {
                $lv[$type] = $level;
                $db->query("UPDATE strongholds SET buildings='" . implode('|', array_map('intval', $lv))
                            . "' WHERE userid=$uid");
                if ($level === 1) {
                    $cell = pick_cell($uid, [[intdiv(ZV2_GRID_W, 2), intdiv(ZV2_GRID_H, 2)]]);
                    if ($cell) $db->query("INSERT INTO facility_positions(userid,slot,grid_x,grid_y)
                                           VALUES($uid,$type,{$cell[0]},{$cell[1]})");
                    $p['lanes'] = null;
                }
            }
            $db->query("UPDATE strongholds SET ressis='" . implode('|', array_map('intval', $res)) . "' WHERE userid=$uid");
            $p['spent']++;
            break;
        }

        // --- record the wave this cycle resolved -------------------------------
        $r = $db->query("SELECT threat,defense,success,resource_loss FROM raids
                          WHERE userid=$uid ORDER BY day_number DESC LIMIT 1");
        if ($r && $r->num_rows) {
            $raid = $r->fetch_assoc();
            $p['waves']++;
            if ((int)$raid['success']) $p['clean']++;
            $p['leaked'] += (int)$raid['resource_loss'];
        }
        $food = pipe_nums($db->query("SELECT ressis FROM strongholds WHERE userid=$uid LIMIT 1")->fetch_assoc()['ressis']);
        if (($food[1] ?? 0) <= 1) $p['starved']++;
    }
    unset($p);
    if ($step % 50 === 0) fwrite(STDERR, sprintf("  step %d/%d  %.0fs\n", $step, $steps, microtime(true) - $t0));
}

// --- report -------------------------------------------------------------------
$by = [];
foreach ($players as $p) {
    $b = &$by[$p['policy']];
    $b['n'] = ($b['n'] ?? 0) + 1;
    $b['clean'] = ($b['clean'] ?? 0) + $p['clean'];
    $b['waves'] = ($b['waves'] ?? 0) + $p['waves'];
    $b['food'] = ($b['food'] ?? 0) + $p['leaked'];
    $b['starved'] = ($b['starved'] ?? 0) + $p['starved'];
    $b['built'] = ($b['built'] ?? 0) + $p['spent'];
    $row = $GLOBALS['db']->query("SELECT ressis,buildings FROM strongholds WHERE userid={$p['uid']}")->fetch_assoc();
    $lv = pipe_nums($row['buildings']);
    $b['levels'] = ($b['levels'] ?? 0) + array_sum($lv);
    $g = $GLOBALS['db']->query("SELECT COUNT(*) c FROM emplacements WHERE userid={$p['uid']}")->fetch_assoc();
    $b['guns'] = ($b['guns'] ?? 0) + (int)$g['c'];
    $alive = $GLOBALS['db']->query("SELECT COUNT(*) c FROM survivors WHERE userid={$p['uid']} AND hp>0")->fetch_assoc();
    $b['alive'] = ($b['alive'] ?? 0) + (int)$alive['c'];
}
unset($b);

printf("\n%-10s %6s %8s %9s %8s %8s %8s %8s\n",
       'policy', 'n', 'waves', 'held %', 'guns', 'fac lv', 'food lost', 'alive');
foreach ($by as $name => $b) {
    printf("%-10s %6d %8.0f %8.1f%% %8.1f %8.1f %8.0f %8.2f\n", $name, $b['n'],
           $b['waves'] / $b['n'], 100 * $b['clean'] / max(1, $b['waves']),
           $b['guns'] / $b['n'], $b['levels'] / $b['n'],
           $b['food'] / $b['n'], $b['alive'] / $b['n']);
}
printf("\nran in %.0fs\n", microtime(true) - $t0);
