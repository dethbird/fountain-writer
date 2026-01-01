<?php
declare(strict_types=1);

namespace App\Services;

use Aura\SqlQuery\QueryFactory;
use PDO;
use PDOException;

class Database
{
    private static ?PDO $pdo = null;
    private static ?QueryFactory $queryFactory = null;

    /**
     * Get the PDO instance (singleton pattern)
     */
    public static function getPdo(): PDO
    {
        if (self::$pdo === null) {
            self::connect();
        }
        return self::$pdo;
    }

    /**
     * Get the Aura.SqlQuery QueryFactory instance
     */
    public static function getQueryFactory(): QueryFactory
    {
        if (self::$queryFactory === null) {
            self::$queryFactory = new QueryFactory('mysql');
        }
        return self::$queryFactory;
    }

    /**
     * Establish database connection using environment variables
     */
    private static function connect(): void
    {
        $host = $_ENV['DB_HOST'] ?? 'localhost';
        $dbName = $_ENV['DB_NAME'] ?? 'fountain';
        $user = $_ENV['DB_USER'] ?? 'fountain';
        $password = $_ENV['DB_PASSWORD'] ?? '';
        $charset = $_ENV['DB_CHARSET'] ?? 'utf8mb4';

        $dsn = "mysql:host={$host};dbname={$dbName};charset={$charset}";

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            self::$pdo = new PDO($dsn, $user, $password, $options);
        } catch (PDOException $e) {
            // Log the error but don't expose credentials in production
            error_log('Database connection failed: ' . $e->getMessage());
            throw new PDOException('Database connection failed. Check your configuration.');
        }
    }

    /**
     * Execute a raw query and return the statement
     */
    public static function query(string $sql, array $params = []): \PDOStatement
    {
        $pdo = self::getPdo();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /**
     * Begin a transaction
     */
    public static function beginTransaction(): bool
    {
        return self::getPdo()->beginTransaction();
    }

    /**
     * Commit a transaction
     */
    public static function commit(): bool
    {
        return self::getPdo()->commit();
    }

    /**
     * Rollback a transaction
     */
    public static function rollback(): bool
    {
        return self::getPdo()->rollBack();
    }
}
