<?php
declare(strict_types=1);

use Slim\App;
use App\Controllers\HomeController;
use App\Controllers\HealthController;
use App\Controllers\AuthController;

return function (App $app): void {
    // API routes first
    $app->get('/api/health', [HealthController::class, 'index']);
    $app->get('/api/me', [AuthController::class, 'me']);
    
    // Auth routes
    $app->get('/auth/google', [AuthController::class, 'googleLogin']);
    $app->get('/auth/google/callback', [AuthController::class, 'googleCallback']);
    $app->post('/auth/logout', [AuthController::class, 'logout']);
    
    // Simple test route
    $app->get('/api/test', function ($request, $response, $args) {
        $response->getBody()->write('{"message": "Test route working"}');
        return $response->withHeader('Content-Type', 'application/json');
    });
    
    // Home route last
    $app->get('/', [HomeController::class, 'index']);
};
