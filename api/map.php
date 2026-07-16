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

// A stable, Berlin-inspired urban layer shared by every player. It adds readable
// geography without changing the authoritative building/room data underneath it.
$urbanAt = static function (int $x, int $y): array {
    $riverY = 25 + (int) round(sin(($x - 3) / 5.2) * 1.8);
    $bridgeXs = [7, 14, 21, 28, 35, 42, 48];
    $water = $y === $riverY;
    $bridge = $water && in_array($x, $bridgeXs, true);
    $ellipse = static fn(float $cx, float $cy, float $rx, float $ry): float => (($x-$cx)/$rx) ** 2 + (($y-$cy)/$ry) ** 2;
    $park = !$water && ($ellipse(19,23,4.8,3.1)<1 || $ellipse(27,37,5.4,2.8)<1 || $ellipse(31,15,3.4,2.7)<1);
    $cityEdge=$ellipse(25.5,25.5,24.5,21.5)+sin($x*.72)*.045+cos($y*.61)*.04;
    $forest=!$water&&!$park&&$cityEdge>1;
    $ring = sqrt((($x-25.5)/18.5)**2 + (($y-25.5)/15.5)**2);
    $railRing = sqrt((($x-25.5)/14.2)**2 + (($y-25.5)/11.6)**2);
    $road = '';
    if (abs($ring-1)<.045) $road='ring';
    elseif ($x===25 || $x===26) $road='ns';
    elseif ($y===22 || $y===29) $road='ew';
    elseif (abs(($x+$y)-51)<=1 && $x>10 && $x<41) $road='diag';
    $rail = abs($railRing-1)<.04 || ($y===18 && $x>=13 && $x<=37);
    $centerDistance = hypot($x-25.5,$y-24.5);
    $density = $centerDistance<8?'core':($centerDistance<16?'inner':'outer');
    if ($y<13) $district='Pankow';
    elseif ($y>38 && $x<27) $district='Tempelhof';
    elseif ($y>36 && $x>=27) $district='Neukölln';
    elseif ($x<13) $district='Spandau';
    elseif ($x>39 && $y<28) $district='Lichtenberg';
    elseif ($x>38) $district='Köpenick';
    elseif ($x<20 && $y<28) $district='Charlottenburg';
    elseif ($x<23 && $y>=28) $district='Schöneberg';
    elseif ($x>29 && $y<24) $district='Prenzlauer Berg';
    elseif ($x>29) $district='Friedrichshain';
    elseif ($y>27) $district='Kreuzberg';
    else $district='Mitte';
    $landmarks = [
        '21|21'=>['Reichstag Ruins','dome'], '22|23'=>['Brandenburg Gate','gate'],
        '27|21'=>['Alexanderplatz','tower'], '19|18'=>['Central Station','station'],
        '17|24'=>['Zoological Gardens','zoo'], '31|26'=>['East Side Wall','wall'],
        '27|37'=>['Tempelhof Airfield','airfield'], '36|17'=>['Old Prison','prison'],
    ];
    $landmark=$landmarks["$x|$y"]??null;
    $districtHubs=['25|24'=>'MITTE','25|32'=>'KREUZBERG','33|27'=>'FRIEDRICHSHAIN','32|18'=>'PRENZLAUER BERG','16|23'=>'CHARLOTTENBURG','19|32'=>'SCHÖNEBERG','29|40'=>'NEUKÖLLN','21|41'=>'TEMPELHOF','27|9'=>'PANKOW','8|25'=>'SPANDAU','42|21'=>'LICHTENBERG','42|35'=>'KÖPENICK'];
    return [
        'terrain'=>$bridge?'bridge':($water?'water':($park?'park':($forest?'forest':'urban'))),
        'district'=>$district,'density'=>$density,'road'=>$road,'rail'=>$rail,
        'landmark'=>$landmark?['name'=>$landmark[0],'kind'=>$landmark[1]]:null,
        'districtHub'=>$districtHubs["$x|$y"]??null,
    ];
};

$r  = max(1, min(25, (int) ($_GET['r'] ?? 12)));
if ($r >= 25) { $x0=1; $x1=$W; $y0=1; $y1=$H; }
else { $x0 = max(1, $px - $r); $x1 = min($W, $px + $r); $y0 = max(1, $py - $r); $y1 = min($H, $py + $r); }

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

    $t = array_merge(['x' => $x, 'y' => $y, 'seen' => $seen || $home], $urbanAt($x,$y));
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
