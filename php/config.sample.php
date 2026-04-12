<?php
// Sante Sync API - Configuration
// Copy this file to config.php and fill in your values.
// config.php is gitignored and should never be committed.

// One-time setup token: used only to create users via setup.php
// Use a long random string - do NOT reuse the value from any example or documentation.
define('SETUP_TOKEN', 'replace-with-a-long-random-string');

define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');

// Teamm API credentials (used server-side only, never exposed to clients)
define('TEAMM_API_BASE', 'https://api.teamm.work');
define('TEAMM_APP_ID', 'your-app-id');
define('TEAMM_SECRET_KEY', 'your-secret-key');
define('TEAMM_PUBLIC_KEY', 'your-public-key');
