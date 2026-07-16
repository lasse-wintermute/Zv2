<?php
// POST /api/resume { userid } — re-attach the session to an existing player. The client
// remembers its player id in localStorage so a browser restart doesn't lose the game.
//
// !! DEV ONLY — this is NOT authentication: it trusts the supplied userid. It is fine for
// a local single-player prototype, but a real password-based login MUST replace this
// before any multiplayer/public deployment.
require __DIR__ . '/_bootstrap.php';
/** @var mysqli $db */
global $db;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') json_err('method', 'POST required', 405);

$uid = (int) ($_POST['userid'] ?? 0);
if ($uid <= 0) json_err('bad_userid', 'userid required');

$r = $db->query(
    'SELECT u.username, s.name AS stronghold FROM users u ' .
    'JOIN strongholds s ON s.userid = u.id WHERE u.id = ' . $uid . ' LIMIT 1'
);
if (!$r || $r->num_rows === 0) json_err('no_such_player', 'No such player.', 404);

$row = $r->fetch_assoc();
api_set_user($uid);
json_out(['ok' => true, 'player' => [
    'id' => $uid, 'name' => $row['username'], 'stronghold' => $row['stronghold'],
]]);
