<?php
// GET /api/map[?r=12] — the wasteland: a 50x50 ruined city,
// one structure per cell). Returns the tiles around the player's camp, respecting the
// with per-player fog in `discovered.data` (2500 chars, pos = (x-1)+(y-1)*50).
// Undiscovered tiles come back as fog (coordinates only — no content leak).
require __DIR__ . '/_bootstrap.php';
/** @var mysqli $db */
global $db;

$uid = api_require_user();
$requestedSquad=(int)($_GET['squad']??0);$squads=zv2_squads($uid);$squad=$squads[0];foreach($squads as$candidate)if($candidate['id']===$requestedSquad)$squad=$candidate;
$W = 50; $H = 50;

$pr = $db->query('SELECT name, location FROM strongholds WHERE userid = ' . $uid . ' LIMIT 1');
if (!$pr || $pr->num_rows === 0) json_err('no_stronghold', 'no stronghold for user ' . $uid, 404);
$p = $pr->fetch_assoc();
$loc = explode('|', $p['location'] ?? '');
$px = (int) ($loc[0] ?? 0);
$py = (int) ($loc[1] ?? 0);

$dr = $db->query('SELECT data FROM discovered WHERE userid = ' . $uid . ' LIMIT 1');
$fog = ($dr && $dr->num_rows) ? (string) $dr->fetch_assoc()['data'] : '';
$seenAt = static function (int $x, int $y) use ($fog, $W): bool {
    if ($x < 1 || $y < 1 || $x > 50 || $y > 50) return false;
    return substr($fog, ($x - 1) + ($y - 1) * $W, 1) === '1';
};

$r  = max(1, min(25, (int) ($_GET['r'] ?? 12)));
$x0 = max(1, $px - $r); $x1 = min($W, $px + $r);
$y0 = max(1, $py - $r); $y1 = min($H, $py + $r);

$q = $db->query(
    'SELECT b.x, b.y, b.typ, b.count_rooms, b.buildingname, t.name AS typename ' .
    'FROM buildings b LEFT JOIN buildingtypes t ON t.id = b.typ ' .
    "WHERE b.x BETWEEN $x0 AND $x1 AND b.y BETWEEN $y0 AND $y1"
);

$tiles = [];
while ($q && ($row = $q->fetch_assoc())) {
    $x = (int) $row['x'];
    $y = (int) $row['y'];
    $seen = $seenAt($x, $y);
    $home = ($x === $px && $y === $py);

    $t = ['x' => $x, 'y' => $y, 'seen' => $seen || $home];
    if ($home) {
        $t['home'] = true;
        $t['name'] = $p['name'];
    } elseif ($seen) {
        $bn = trim((string) ($row['buildingname'] ?? ''));
        $t['type']  = (int) $row['typ'];
        $t['name']  = $bn !== '' ? $bn : (string) ($row['typename'] ?? ('Building #' . $row['typ']));
        $t['rooms'] = (int) $row['count_rooms'];
    } else {
        // frontier rule: you may only explore next to ground you already know
        $t['scoutable'] = $seenAt($x + 1, $y) || $seenAt($x - 1, $y) || $seenAt($x, $y + 1) || $seenAt($x, $y - 1);
    }
    $tiles[] = $t;
}

json_out([
    'ok'     => true,
    'world'  => ['w' => $W, 'h' => $H],
    'player' => ['x' => $px, 'y' => $py, 'name' => $p['name']],
    'squad'  => $squad,
    'squads' => $squads,
    'tiles'  => $tiles,
]);
