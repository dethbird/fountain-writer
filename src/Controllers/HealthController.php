<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class HealthController
{
    public function index(Request $request, Response $response): Response
    {
        $health = [
            'ok' => true,
            'timestamp' => date('c'),
        ];

        // Check database connectivity
        try {
            $pdo = Database::getPdo();
            $stmt = $pdo->query('SELECT 1');
            $health['database'] = [
                'status' => 'connected',
                'name' => $_ENV['DB_NAME'] ?? 'unknown'
            ];
        } catch (\Exception $e) {
            $health['ok'] = false;
            $health['database'] = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $payload = json_encode($health, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        $response->getBody()->write($payload);
        
        $statusCode = $health['ok'] ? 200 : 503;
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($statusCode);
    }
}
