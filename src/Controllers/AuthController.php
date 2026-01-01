<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\Database;
use Jumbojett\OpenIDConnectClient;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use SlimSession\Helper as SessionHelper;

class AuthController
{
    /**
     * Initiate Google OIDC login flow
     * GET /auth/google
     */
    public function googleLogin(Request $request, Response $response): Response
    {
        try {
            $oidc = $this->createOidcClient();
            $oidc->setRedirectURL($_ENV['GOOGLE_REDIRECT_URI']);
            $oidc->addScope(['openid', 'email', 'profile']);
            
            // This will redirect to Google
            $oidc->authenticate();
            
            // Won't reach here - authenticate() redirects
            return $response;
            
        } catch (\Exception $e) {
            error_log('Google login error: ' . $e->getMessage());
            return $this->jsonError($response, 'Failed to initiate login', 500);
        }
    }

    /**
     * Handle Google OIDC callback
     * GET /auth/google/callback
     */
    public function googleCallback(Request $request, Response $response): Response
    {
        $session = new SessionHelper();
        
        try {
            $oidc = $this->createOidcClient();
            $oidc->setRedirectURL($_ENV['GOOGLE_REDIRECT_URI']);
            $oidc->addScope(['openid', 'email', 'profile']);
            
            // Authenticate and verify the ID token
            $oidc->authenticate();
            
            // Extract claims from the verified ID token
            $sub = $oidc->getVerifiedClaims('sub');
            $email = $oidc->getVerifiedClaims('email');
            $emailVerified = $oidc->getVerifiedClaims('email_verified');
            $name = $oidc->getVerifiedClaims('name');
            $picture = $oidc->getVerifiedClaims('picture');
            $issuer = $_ENV['GOOGLE_ISSUER'];
            
            if (!$sub || !$email) {
                throw new \Exception('Missing required claims from ID token');
            }
            
            // Upsert user and identity
            $userId = $this->upsertUser($email, $name, $picture, $issuer, $sub, $emailVerified);
            
            // Set session
            $session->set('user_id', $userId);
            $session->set('email', $email);
            $session->set('name', $name);
            $session->set('picture', $picture);
            
            // Redirect to app
            $appUrl = $_ENV['APP_BASE_URL'] ?? '';
            return $response
                ->withHeader('Location', $appUrl . '/')
                ->withStatus(302);
                
        } catch (\Exception $e) {
            error_log('Google callback error: ' . $e->getMessage());
            
            // Redirect to app with error
            $appUrl = $_ENV['APP_BASE_URL'] ?? '';
            return $response
                ->withHeader('Location', $appUrl . '/?auth_error=1')
                ->withStatus(302);
        }
    }

    /**
     * Logout - clear session
     * POST /auth/logout
     */
    public function logout(Request $request, Response $response): Response
    {
        $session = new SessionHelper();
        $session::destroy();
        
        $data = ['ok' => true, 'message' => 'Logged out'];
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json');
    }

    /**
     * Get current user from session
     * GET /api/me
     */
    public function me(Request $request, Response $response): Response
    {
        $session = new SessionHelper();
        
        $userId = $session->get('user_id');
        
        if (!$userId) {
            $data = ['authenticated' => false];
            $response->getBody()->write(json_encode($data));
            return $response->withHeader('Content-Type', 'application/json');
        }
        
        // Fetch user from database
        try {
            $pdo = Database::getPdo();
            $stmt = $pdo->prepare('SELECT id, email, name, picture, created_at FROM users WHERE id = ?');
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            
            if (!$user) {
                // Session has invalid user_id, clear it
                $session::destroy();
                $data = ['authenticated' => false];
                $response->getBody()->write(json_encode($data));
                return $response->withHeader('Content-Type', 'application/json');
            }
            
            $data = [
                'authenticated' => true,
                'user' => [
                    'id' => (int) $user['id'],
                    'email' => $user['email'],
                    'name' => $user['name'],
                    'picture' => $user['picture'],
                    'created_at' => $user['created_at']
                ]
            ];
            
            $response->getBody()->write(json_encode($data));
            return $response->withHeader('Content-Type', 'application/json');
            
        } catch (\Exception $e) {
            error_log('Error fetching user: ' . $e->getMessage());
            return $this->jsonError($response, 'Failed to fetch user', 500);
        }
    }

    /**
     * Create configured OIDC client for Google
     */
    private function createOidcClient(): OpenIDConnectClient
    {
        $oidc = new OpenIDConnectClient(
            $_ENV['GOOGLE_ISSUER'],
            $_ENV['GOOGLE_CLIENT_ID'],
            $_ENV['GOOGLE_CLIENT_SECRET']
        );
        
        // Use authorization code flow
        $oidc->setResponseTypes(['code']);
        
        return $oidc;
    }

    /**
     * Upsert user and identity records
     * Returns user ID
     */
    private function upsertUser(
        string $email, 
        ?string $name, 
        ?string $picture,
        string $issuer,
        string $subject,
        bool $emailVerified
    ): int {
        $pdo = Database::getPdo();
        $emailNorm = strtolower(trim($email));
        
        $pdo->beginTransaction();
        
        try {
            // Check if user exists by normalized email
            $stmt = $pdo->prepare('SELECT id FROM users WHERE email_norm = ?');
            $stmt->execute([$emailNorm]);
            $existingUser = $stmt->fetch();
            
            if ($existingUser) {
                $userId = (int) $existingUser['id'];
                
                // Update user info
                $stmt = $pdo->prepare('UPDATE users SET name = ?, picture = ?, updated_at = NOW() WHERE id = ?');
                $stmt->execute([$name, $picture, $userId]);
            } else {
                // Create new user
                $stmt = $pdo->prepare('INSERT INTO users (email, email_norm, name, picture) VALUES (?, ?, ?, ?)');
                $stmt->execute([$email, $emailNorm, $name, $picture]);
                $userId = (int) $pdo->lastInsertId();
            }
            
            // Upsert identity (issuer + subject is unique key)
            $stmt = $pdo->prepare('
                INSERT INTO user_identities (user_id, issuer, subject, email, email_verified)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    email = VALUES(email),
                    email_verified = VALUES(email_verified),
                    updated_at = NOW()
            ');
            $stmt->execute([$userId, $issuer, $subject, $email, $emailVerified ? 1 : 0]);
            
            $pdo->commit();
            
            return $userId;
            
        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Return JSON error response
     */
    private function jsonError(Response $response, string $message, int $status): Response
    {
        $data = ['error' => true, 'message' => $message];
        $response->getBody()->write(json_encode($data));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    }
}
