<?php
// Sante Sync API v1.1.0

require_once __DIR__ . '/config.php';

// --- CORS headers ---
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Device-Id, X-Device-Name');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- Authentication (HTTP Basic Auth: username:password) ---
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Basic\s+(.+)$/i', $authHeader, $matches)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$decoded = base64_decode($matches[1]);
[$username, $password] = array_pad(explode(':', $decoded, 2), 2, '');

// --- Database connection ---
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

// --- Create tables on first run ---
$pdo->exec("
    CREATE TABLE IF NOT EXISTS users (
        id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username     VARCHAR(60)  NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

$pdo->exec("
    CREATE TABLE IF NOT EXISTS series_state (
        prefix         VARCHAR(30)  NOT NULL PRIMARY KEY,
        csv_data       LONGTEXT,
        csv_updated_at BIGINT,
        export_queue   LONGTEXT,
        updated_at     DATETIME     NOT NULL,
        updated_by     VARCHAR(64),
        device_name    VARCHAR(100),
        is_current     TINYINT(1)   NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// Add is_current column if upgrading from older schema
try {
    $pdo->exec("ALTER TABLE series_state ADD COLUMN is_current TINYINT(1) NOT NULL DEFAULT 0");
} catch (PDOException $e) {
    // Column already exists, ignore
}

$pdo->exec("
    CREATE TABLE IF NOT EXISTS series_locks (
        prefix       VARCHAR(30)  NOT NULL PRIMARY KEY,
        device_id    VARCHAR(64)  NOT NULL,
        device_name  VARCHAR(100) NOT NULL,
        locked_at    DATETIME     NOT NULL,
        expires_at   DATETIME     NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// --- Verify credentials ---
$stmt = $pdo->prepare('SELECT password_hash FROM users WHERE username = ?');
$stmt->execute([trim($username)]);
$userRow = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$userRow || !password_verify($password, $userRow['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid username or password']);
    exit;
}

// --- Request metadata ---
$deviceId   = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $_SERVER['HTTP_X_DEVICE_ID'] ?? 'unknown'), 0, 64);
$deviceName = substr($_SERVER['HTTP_X_DEVICE_NAME'] ?? 'Unknown', 0, 100);
$action     = $_GET['action'] ?? '';
$method     = $_SERVER['REQUEST_METHOD'];

// --- Routing ---
switch ($action) {

    // ================================================================
    // GET  ?action=state&prefix=25S19  -> return series state
    // POST ?action=state               -> save series state
    // ================================================================
    case 'state':
        if ($method === 'GET') {
            $prefix = trim($_GET['prefix'] ?? '');
            if (!$prefix) {
                echo json_encode(['success' => true, 'export_queue' => [], 'csv_data' => null, 'csv_updated_at' => null]);
                exit;
            }

            $stmt = $pdo->prepare('SELECT * FROM series_state WHERE prefix = ?');
            $stmt->execute([$prefix]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($row) {
                echo json_encode([
                    'success'        => true,
                    'export_queue'   => json_decode($row['export_queue'], true) ?? [],
                    'csv_data'       => json_decode($row['csv_data'], true),
                    'csv_updated_at' => (int)$row['csv_updated_at'],
                ]);
            } else {
                echo json_encode(['success' => true, 'export_queue' => [], 'csv_data' => null, 'csv_updated_at' => null]);
            }

        } elseif ($method === 'POST') {
            $body = json_decode(file_get_contents('php://input'), true);
            if (!$body) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }

            $prefix       = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $body['prefix'] ?? ''), 0, 30);
            $exportQueue  = json_encode($body['export_queue'] ?? []);
            $csvData      = isset($body['csv_data']) ? json_encode($body['csv_data']) : null;
            $csvUpdatedAt = isset($body['csv_updated_at']) ? (int)$body['csv_updated_at'] : null;

            if (!$prefix) { http_response_code(400); echo json_encode(['error' => 'Missing prefix']); exit; }

            $stmt = $pdo->prepare('
                INSERT INTO series_state (prefix, csv_data, csv_updated_at, export_queue, updated_at, updated_by, device_name)
                VALUES (?, ?, ?, ?, NOW(), ?, ?)
                ON DUPLICATE KEY UPDATE
                    csv_data       = VALUES(csv_data),
                    csv_updated_at = VALUES(csv_updated_at),
                    export_queue   = VALUES(export_queue),
                    updated_at     = NOW(),
                    updated_by     = VALUES(updated_by),
                    device_name    = VALUES(device_name)
            ');
            $stmt->execute([$prefix, $csvData, $csvUpdatedAt, $exportQueue, $deviceId, $deviceName]);
            echo json_encode(['success' => true]);
        }
        break;

    // ================================================================
    // GET    ?action=locks  -> list active locks
    // POST   ?action=lock   -> acquire lock on a series
    // DELETE ?action=lock   -> release lock
    // ================================================================
    case 'locks':
    case 'lock':
        if ($method === 'GET' || $action === 'locks') {
            $stmt = $pdo->query('SELECT prefix, device_name, locked_at, expires_at FROM series_locks WHERE expires_at > NOW()');
            echo json_encode(['success' => true, 'locks' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

        } elseif ($method === 'POST') {
            $body   = json_decode(file_get_contents('php://input'), true);
            $prefix = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $body['prefix'] ?? ''), 0, 30);
            $force  = !empty($body['force']);

            if (!$prefix) { http_response_code(400); echo json_encode(['error' => 'Missing prefix']); exit; }

            // Check for an existing unexpired lock held by someone else
            $stmt = $pdo->prepare('SELECT * FROM series_locks WHERE prefix = ? AND expires_at > NOW()');
            $stmt->execute([$prefix]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existing && $existing['device_id'] !== $deviceId && !$force) {
                echo json_encode([
                    'success'   => false,
                    'locked'    => true,
                    'locked_by' => $existing['device_name'],
                    'locked_at' => $existing['locked_at'],
                ]);
            } else {
                // Acquire or refresh lock (expires in 30 minutes)
                $stmt = $pdo->prepare('
                    INSERT INTO series_locks (prefix, device_id, device_name, locked_at, expires_at)
                    VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE))
                    ON DUPLICATE KEY UPDATE
                        device_id   = VALUES(device_id),
                        device_name = VALUES(device_name),
                        locked_at   = NOW(),
                        expires_at  = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
                ');
                $stmt->execute([$prefix, $deviceId, $deviceName]);
                echo json_encode(['success' => true, 'locked' => false]);
            }

        } elseif ($method === 'DELETE') {
            $body   = json_decode(file_get_contents('php://input'), true);
            $prefix = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $body['prefix'] ?? ''), 0, 30);

            $stmt = $pdo->prepare('DELETE FROM series_locks WHERE prefix = ? AND device_id = ?');
            $stmt->execute([$prefix, $deviceId]);
            echo json_encode(['success' => true]);
        }
        break;

    // ================================================================
    // GET  ?action=series         -> returns the current active series
    // POST ?action=series         -> marks a prefix as current
    // ================================================================
    case 'series':
        if ($method === 'GET') {
            $stmt = $pdo->query('SELECT prefix, updated_at FROM series_state WHERE is_current = 1 LIMIT 1');
            $row  = $stmt->fetch(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'current' => $row ?: null]);

        } elseif ($method === 'POST') {
            $body   = json_decode(file_get_contents('php://input'), true);
            $prefix = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $body['prefix'] ?? ''), 0, 30);
            if (!$prefix) { http_response_code(400); echo json_encode(['error' => 'Missing prefix']); exit; }

            // Clear current flag on all, then set on this prefix
            $pdo->exec("UPDATE series_state SET is_current = 0");
            $pdo->prepare("UPDATE series_state SET is_current = 1 WHERE prefix = ?")->execute([$prefix]);
            echo json_encode(['success' => true]);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Unknown action']);
}
