<?php
// Standalone Zv2 bootstrap. This project owns its database and mechanics.
declare(strict_types=1);

session_name('zv2sid');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true'); header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Accept, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

$dbHost = getenv('ZV2_DB_HOST') ?: '127.0.0.1';
$dbPort = (int) (getenv('ZV2_DB_PORT') ?: 3306);
$dbUser = getenv('ZV2_DB_USER') ?: 'root';
$dbPass = getenv('ZV2_DB_PASS') ?: '';
$dbName = getenv('ZV2_DB_NAME') ?: 'zv2';
mysqli_report(MYSQLI_REPORT_OFF);
$db = @new mysqli($dbHost, $dbUser, $dbPass, $dbName, $dbPort);
if ($db->connect_errno) json_err('database_offline', "Zv2 database unavailable. Run database/install.php.", 503);
$db->set_charset('utf8mb4');

require_once __DIR__ . '/mechanics.php';

function api_user_id(): int { return (int) ($_SESSION['userid'] ?? 0); }
function api_set_user(int $uid): void { $_SESSION['userid'] = $uid; }
function api_clear_user(): void { unset($_SESSION['userid']); }
function api_require_user(): int {
    $uid = api_user_id();
    if ($uid <= 0) json_err('no_player', 'No active player — start a new game.', 401);
    return $uid;
}
function json_out(array $data): never { echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function json_err(string $code, string $message, int $http = 400): never {
    http_response_code($http); echo json_encode(['ok' => false, 'error' => $code, 'message' => $message]); exit;
}
function pipe_nums(?string $s): array { return ($s === null || $s === '') ? [] : array_map(static fn($v) => 0 + $v, explode('|', $s)); }
