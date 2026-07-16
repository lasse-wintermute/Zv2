<?php
// GET /api/session — who is the active player? `player: null` means no game in
// progress, and the client shows the start screen.
require __DIR__ . '/_bootstrap.php';
/** @var mysqli $db */
global $db;

$uid = api_user_id();
if ($uid <= 0) json_out(['ok' => true, 'player' => null]);

$r = $db->query(
    'SELECT u.username, s.name AS stronghold FROM users u ' .
    'LEFT JOIN strongholds s ON s.userid = u.id WHERE u.id = ' . $uid . ' LIMIT 1'
);
if (!$r || $r->num_rows === 0) {   // stale session (player gone)
    api_clear_user();
    json_out(['ok' => true, 'player' => null]);
}
$row = $r->fetch_assoc();
json_out(['ok' => true, 'player' => [
    'id' => $uid, 'name' => $row['username'], 'stronghold' => $row['stronghold'],
]]);
