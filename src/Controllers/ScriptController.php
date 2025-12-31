<?php

namespace App\Controllers;

use App\Services\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use SlimSession\Helper as SessionHelper;

class ScriptController
{
    public function getScripts(Request $request, Response $response): Response
    {
        $session = new SessionHelper();
        
        if (!$session->exists('user_id')) {
            $response->getBody()->write(json_encode([
                'error' => 'Not authenticated'
            ]));
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(401);
        }
        
        $userId = $session->get('user_id');
        
        try {
            $db = Database::getPdo();
            $stmt = $db->prepare('
                SELECT id, title, source, created_at, updated_at 
                FROM scripts 
                WHERE user_id = :user_id 
                ORDER BY updated_at DESC
            ');
            $stmt->execute(['user_id' => $userId]);
            $scripts = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            $response->getBody()->write(json_encode([
                'scripts' => $scripts
            ]));
            
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(200);
        } catch (\Exception $e) {
            error_log('Error fetching scripts: ' . $e->getMessage());
            
            $response->getBody()->write(json_encode([
                'error' => 'Failed to fetch scripts'
            ]));
            
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(500);
        }
    }
}
