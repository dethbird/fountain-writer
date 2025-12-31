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
    
    public function getScript(Request $request, Response $response, array $args): Response
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
        $scriptId = (int)$args['id'];
        
        try {
            $db = Database::getPdo();
            $stmt = $db->prepare('
                SELECT id, title, source, created_at, updated_at 
                FROM scripts 
                WHERE id = :id AND user_id = :user_id
            ');
            $stmt->execute(['id' => $scriptId, 'user_id' => $userId]);
            $script = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$script) {
                $response->getBody()->write(json_encode([
                    'error' => 'Script not found'
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(404);
            }
            
            $response->getBody()->write(json_encode([
                'script' => $script
            ]));
            
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(200);
        } catch (\Exception $e) {
            error_log('Error fetching script: ' . $e->getMessage());
            
            $response->getBody()->write(json_encode([
                'error' => 'Failed to fetch script'
            ]));
            
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(500);
        }
    }
    
    public function createScript(Request $request, Response $response): Response
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
        $body = $request->getParsedBody();
        
        $title = $body['title'] ?? 'Untitled Script';
        $source = $body['source'] ?? '';
        
        try {
            $db = Database::getPdo();
            $stmt = $db->prepare('
                INSERT INTO scripts (user_id, title, source) 
                VALUES (:user_id, :title, :source)
            ');
            $stmt->execute([
                'user_id' => $userId,
                'title' => $title,
                'source' => $source
            ]);
            
            $scriptId = $db->lastInsertId();
            
            // Fetch the created script
            $stmt = $db->prepare('
                SELECT id, title, source, created_at, updated_at 
                FROM scripts 
                WHERE id = :id
            ');
            $stmt->execute(['id' => $scriptId]);
            $script = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            $response->getBody()->write(json_encode([
                'script' => $script
            ]));
            
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(201);
        } catch (\Exception $e) {
            error_log('Error creating script: ' . $e->getMessage());
            
            $response->getBody()->write(json_encode([
                'error' => 'Failed to create script'
            ]));
            
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(500);
        }
    }
    
    public function updateScript(Request $request, Response $response, array $args): Response
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
        $scriptId = (int)$args['id'];
        $body = $request->getParsedBody();
        
        $source = $body['source'] ?? null;
        $title = $body['title'] ?? null;
        
        if ($source === null && $title === null) {
            $response->getBody()->write(json_encode([
                'error' => 'No data to update'
            ]));
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(400);
        }
        
        try {
            $db = Database::getPdo();
            
            // Check if script exists and belongs to user
            $stmt = $db->prepare('SELECT id FROM scripts WHERE id = :id AND user_id = :user_id');
            $stmt->execute(['id' => $scriptId, 'user_id' => $userId]);
            
            if (!$stmt->fetch()) {
                $response->getBody()->write(json_encode([
                    'error' => 'Script not found'
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(404);
            }
            
            // Build update query
            $updates = [];
            $params = ['id' => $scriptId, 'user_id' => $userId];
            
            if ($source !== null) {
                $updates[] = 'source = :source';
                $params['source'] = $source;
            }
            
            if ($title !== null) {
                $updates[] = 'title = :title';
                $params['title'] = $title;
            }
            
            $sql = 'UPDATE scripts SET ' . implode(', ', $updates) . ' WHERE id = :id AND user_id = :user_id';
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            
            // Fetch updated script
            $stmt = $db->prepare('
                SELECT id, title, source, created_at, updated_at 
                FROM scripts 
                WHERE id = :id
            ');
            $stmt->execute(['id' => $scriptId]);
            $script = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            $response->getBody()->write(json_encode([
                'script' => $script
            ]));
            
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(200);
        } catch (\Exception $e) {
            error_log('Error updating script: ' . $e->getMessage());
            
            $response->getBody()->write(json_encode([
                'error' => 'Failed to update script'
            ]));
            
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(500);
        }
    }
}
