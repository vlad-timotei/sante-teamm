<?php
// Sante Sync API v1.4.0

require_once __DIR__ . '/config.php';

// --- CORS headers (restricted to Sante portal) ---
$allowedOrigins = [
    'https://rezultateptmedici.clinica-sante.ro',
    'https://teamm.work',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header('Access-Control-Allow-Origin: https://rezultateptmedici.clinica-sante.ro');
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Device-Id, X-Device-Name');
header('Vary: Origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- Payload size limit (1 MB) ---
$rawInput = file_get_contents('php://input');
if (strlen($rawInput) > 1048576) {
    http_response_code(413);
    echo json_encode(['error' => 'Payload too large']);
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

// --- Rate limiting on failed auth (5 attempts per 15 min per IP) ---
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

// Ensure tables exist (lightweight check, runs once)
$existingTables = [];
$tq = $pdo->query("SHOW TABLES");
while ($t = $tq->fetchColumn()) $existingTables[] = $t;

if (!in_array('auth_attempts', $existingTables)) {
    $pdo->exec("
        CREATE TABLE auth_attempts (
            ip          VARCHAR(45)  NOT NULL,
            attempted_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ip_time (ip, attempted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

if (!in_array('test_definitions', $existingTables)) {
    $pdo->exec("
        CREATE TABLE test_definitions (
            `key`        VARCHAR(60)  NOT NULL PRIMARY KEY,
            name         VARCHAR(120) NOT NULL,
            pattern      VARCHAR(255) NOT NULL,
            created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

// Clean old attempts
$pdo->exec("DELETE FROM auth_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");

$stmt = $pdo->prepare('SELECT COUNT(*) FROM auth_attempts WHERE ip = ?');
$stmt->execute([$clientIp]);
$failCount = (int)$stmt->fetchColumn();

if ($failCount >= 5) {
    http_response_code(429);
    echo json_encode(['error' => 'Too many failed attempts. Try again later.']);
    exit;
}

// --- Verify credentials ---
$stmt = $pdo->prepare('SELECT password_hash FROM users WHERE username = ?');
$stmt->execute([trim($username)]);
$userRow = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$userRow || !password_verify($password, $userRow['password_hash'])) {
    // Record failed attempt
    $pdo->prepare('INSERT INTO auth_attempts (ip) VALUES (?)')->execute([$clientIp]);
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
            $prefix = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['prefix'] ?? ''), 0, 30);
            if (!$prefix) {
                echo json_encode(['success' => true, 'export_queue' => []]);
                exit;
            }

            $stmt = $pdo->prepare('SELECT * FROM series_state WHERE prefix = ?');
            $stmt->execute([$prefix]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($row) {
                echo json_encode([
                    'success'        => true,
                    'export_queue'   => json_decode($row['export_queue'], true) ?? [],
                ]);
            } else {
                echo json_encode(['success' => true, 'export_queue' => []]);
            }

        } elseif ($method === 'POST') {
            $body = json_decode($rawInput, true);
            if (!$body) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }

            $prefix       = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $body['prefix'] ?? ''), 0, 30);
            $exportQueue  = json_encode($body['export_queue'] ?? []);

            if (!$prefix) { http_response_code(400); echo json_encode(['error' => 'Missing prefix']); exit; }

            $stmt = $pdo->prepare('
                INSERT INTO series_state (prefix, export_queue, updated_at, updated_by, device_name)
                VALUES (?, ?, NOW(), ?, ?)
                ON DUPLICATE KEY UPDATE
                    export_queue   = VALUES(export_queue),
                    updated_at     = NOW(),
                    updated_by     = VALUES(updated_by),
                    device_name    = VALUES(device_name)
            ');
            $stmt->execute([$prefix, $exportQueue, $deviceId, $deviceName]);
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
            $body   = json_decode($rawInput, true);
            $prefix = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $body['prefix'] ?? ''), 0, 30);

            // Clear current flag on all series
            $pdo->exec("UPDATE series_state SET is_current = 0");

            // If a prefix was provided, mark it as current
            if ($prefix) {
                $pdo->prepare("UPDATE series_state SET is_current = 1 WHERE prefix = ?")->execute([$prefix]);
            }

            echo json_encode(['success' => true]);
        }
        break;

    // ================================================================
    // GET  ?action=series_list    -> returns all series (prefix, updated_at)
    // ================================================================
    case 'series_list':
        if ($method === 'GET') {
            $stmt = $pdo->query("SELECT prefix, updated_at, is_current FROM series_state ORDER BY LEFT(prefix, 2), CAST(SUBSTRING(prefix, 4) AS UNSIGNED)");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'series' => $rows]);
        }
        break;

    // ================================================================
    // POST ?action=sync_sessions       -> fetch sessions from Teamm API
    //   Range: 6 months back to end of current year
    // ================================================================
    case 'sync_sessions':
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'POST required']); exit; }

        $year = (int)date('Y');
        $yy   = substr((string)$year, -2);

        $startDate = urlencode("{$year}-01-01T00:00:00.000Z");
        $endDate   = urlencode("{$year}-12-31T23:59:59.999Z");
        $url = TEAMM_API_BASE . "/sessions?startDate={$startDate}&endDate={$endDate}&start=1&length=50";

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'X-API-APP-ID: '     . TEAMM_APP_ID,
                'X-API-SECRET-KEY: ' . TEAMM_SECRET_KEY,
                'X-API-PUBLIC-KEY: ' . TEAMM_PUBLIC_KEY,
            ],
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            http_response_code(502);
            echo json_encode(['error' => 'Teamm API request failed', 'httpCode' => $httpCode]);
            exit;
        }

        $teammData = json_decode($response, true);
        $sessions  = $teammData['data'] ?? [];
        $created   = 0;
        $skipped   = 0;

        foreach ($sessions as $session) {
            $prefix   = $yy . $session['name'];    // e.g. "26S1"
            $teammId  = $session['_id'];

            // Check if prefix already exists
            $check = $pdo->prepare('SELECT prefix FROM series_state WHERE prefix = ?');
            $check->execute([$prefix]);
            if ($check->fetch()) {
                // Update teamm_session_id if missing
                $pdo->prepare('UPDATE series_state SET teamm_session_id = ? WHERE prefix = ? AND teamm_session_id IS NULL')
                     ->execute([$teammId, $prefix]);
                $skipped++;
                continue;
            }

            $stmt = $pdo->prepare('
                INSERT INTO series_state (prefix, teamm_session_id, updated_at, updated_by, device_name)
                VALUES (?, ?, NOW(), ?, ?)
            ');
            $stmt->execute([$prefix, $teammId, $deviceId, $deviceName]);
            $created++;
        }

        echo json_encode([
            'success' => true,
            'total'   => count($sessions),
            'created' => $created,
            'skipped' => $skipped,
        ]);
        break;


    // ================================================================
    // GET ?action=fetch_guests&prefix=26S1  -> fetch patient IDs from
    //   Teamm API for the session matching this prefix
    // ================================================================
    case 'fetch_guests':
        if ($method !== 'GET') { http_response_code(405); echo json_encode(['error' => 'GET required']); exit; }

        $prefix = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['prefix'] ?? ''), 0, 30);
        if (!$prefix) { http_response_code(400); echo json_encode(['error' => 'Missing prefix']); exit; }

        // Look up teamm_session_id
        $stmt = $pdo->prepare('SELECT teamm_session_id FROM series_state WHERE prefix = ?');
        $stmt->execute([$prefix]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || !$row['teamm_session_id']) {
            http_response_code(404);
            echo json_encode(['error' => 'Session not found or missing Teamm ID']);
            exit;
        }

        $sessionId = $row['teamm_session_id'];
        $url = TEAMM_API_BASE . "/guests?sessionId={$sessionId}&role=patient&project=" . urlencode('firstName,lastName,startDate,bookingId');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'X-API-APP-ID: '     . TEAMM_APP_ID,
                'X-API-SECRET-KEY: ' . TEAMM_SECRET_KEY,
                'X-API-PUBLIC-KEY: ' . TEAMM_PUBLIC_KEY,
            ],
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            http_response_code(502);
            echo json_encode(['error' => 'Teamm API request failed', 'httpCode' => $httpCode]);
            exit;
        }

        $teammData = json_decode($response, true);
        $guests    = $teammData['data'] ?? [];

        // Convert to [{name, fullId}]
        $csvData = [];
        foreach ($guests as $guest) {
            $name = trim(($guest['lastName'] ?? '') . ' ' . ($guest['firstName'] ?? ''));
            $csvData[] = [
                'name'   => $name,
                'fullId' => $guest['bookingId'] ?? '',
            ];
        }

        echo json_encode([
            'success'  => true,
            'patients' => $csvData,
            'total'    => count($csvData),
        ]);
        break;


    // ================================================================
    // GET    ?action=test_definitions          -> list all
    // POST   ?action=test_definitions          -> add/update
    //   Body: { "key": "B12", "name": "Vitamina B12", "pattern": "Vitamina\\s+B12", "sort_order": 0 }
    // DELETE ?action=test_definitions&key=B12  -> delete one
    // ================================================================
    case 'test_definitions':
        if ($method === 'GET') {
            $stmt = $pdo->query('SELECT `key`, name, pattern FROM test_definitions ORDER BY `key`');
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'tests' => $rows]);

        } elseif ($method === 'POST') {
            $body = json_decode($rawInput, true);
            if (!$body) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }

            $key     = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $body['key'] ?? ''), 0, 60);
            $name    = substr(trim($body['name'] ?? ''), 0, 120);
            $pattern = substr(trim($body['pattern'] ?? ''), 0, 255);

            if (!$key || !$name || !$pattern) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing key, name, or pattern']);
                exit;
            }

            $stmt = $pdo->prepare('
                INSERT INTO test_definitions (`key`, name, pattern)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name    = VALUES(name),
                    pattern = VALUES(pattern)
            ');
            $stmt->execute([$key, $name, $pattern]);
            echo json_encode(['success' => true]);

        } elseif ($method === 'DELETE') {
            $key = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['key'] ?? ''), 0, 60);
            if (!$key) { http_response_code(400); echo json_encode(['error' => 'Missing key']); exit; }

            $pdo->prepare('DELETE FROM test_definitions WHERE `key` = ?')->execute([$key]);
            echo json_encode(['success' => true]);
        }
        break;


    default:
        http_response_code(404);
        echo json_encode(['error' => 'Unknown action']);
}
