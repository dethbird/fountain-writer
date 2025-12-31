<?php
declare(strict_types=1);

use Slim\Factory\AppFactory;
use Slim\Views\Twig;
use Slim\Views\TwigMiddleware;

require __DIR__ . '/../vendor/autoload.php';

// Bootstrap env and app
$envFile = dirname(__DIR__).'/.env';
if (file_exists($envFile)) {
    $dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
    $dotenv->load();
}

// Initialize database connection (lazy loaded on first use)
// This ensures the Database service is available throughout the app
// Connection will be established when Database::getPdo() is first called
use App\Services\Database;

$app = AppFactory::create();

// Configure Twig
$twig = Twig::create(__DIR__ . '/../templates', [
    'cache' => false, // Set to a cache directory in production
]);

// Add Twig-View Middleware
$app->add(TwigMiddleware::create($app, $twig));

// Session middleware
$sessionName = $_ENV['APP_SESSION_NAME'] ?? 'fountain_session';
$app->add(new \Slim\Middleware\Session([
    'name' => $sessionName,
    'autorefresh' => true,
    'lifetime' => '2 hours',
    'httponly' => true,
    'secure' => true,
    'samesite' => 'Lax',
]));

// Base path if deployed in a subdirectory
$basePath = $_ENV['APP_BASE_PATH'] ?? '';
if ($basePath) {
    $app->setBasePath($basePath);
}

// Middleware
$app->addBodyParsingMiddleware(); // JSON/form parsing
$app->addRoutingMiddleware();

$displayErrorDetails = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOL);
$errorMiddleware = $app->addErrorMiddleware($displayErrorDetails, true, true);

// CORS (very permissive; tune for production)
$app->add(new App\Middleware\CorsMiddleware());

// Routes
(require __DIR__ . '/../src/Routes.php')($app);

// Run
$app->run();
