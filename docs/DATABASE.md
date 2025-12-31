# Database Setup

## Configuration

Copy `.env.shadow` to `.env` to get started:

```bash
cp .env.shadow .env
```

The default database configuration is:
- **Database**: fountain
- **User**: fountain
- **Password**: P1zzaP4rty!!!
- **Host**: localhost

## Creating the Database

1. Log into MySQL:
```bash
mysql -u root -p
```

2. Create the database and user:
```sql
CREATE DATABASE fountain CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fountain'@'localhost' IDENTIFIED BY 'P1zzaP4rty!!!';
GRANT ALL PRIVILEGES ON fountain.* TO 'fountain'@'localhost';
FLUSH PRIVILEGES;
```

## Testing the Connection

After setting up the database, test the connection via the health check endpoint:

```bash
# Start the PHP development server
composer start
```

Then visit:
- http://localhost:8080/api/health - Health check includes database connectivity status

The health check response includes database status:
```json
{
  "ok": true,
  "timestamp": "2025-12-31T10:00:00+00:00",
  "database": {
    "status": "connected",
    "name": "fountain"
  }
}
```

## Using the Database

The `App\Services\Database` class provides:

### PDO Connection
```php
use App\Services\Database;

$pdo = Database::getPdo();
$stmt = $pdo->query('SELECT * FROM users');
$users = $stmt->fetchAll();
```

### Aura.SqlQuery Query Builder
```php
use App\Services\Database;

$pdo = Database::getPdo();
$queryFactory = Database::getQueryFactory();

// SELECT example
$select = $queryFactory->newSelect();
$select
    ->cols(['*'])
    ->from('users')
    ->where('email = :email')
    ->bindValue('email', 'user@example.com');

$stmt = $pdo->prepare($select->getStatement());
$stmt->execute($select->getBindValues());
$user = $stmt->fetch();

// INSERT example
$insert = $queryFactory->newInsert();
$insert
    ->into('users')
    ->cols([
        'email' => 'new@example.com',
        'name' => 'New User',
        'created_at' => date('Y-m-d H:i:s')
    ]);

$stmt = $pdo->prepare($insert->getStatement());
$stmt->execute($insert->getBindValues());
$userId = $pdo->lastInsertId();

// UPDATE example
$update = $queryFactory->newUpdate();
$update
    ->table('users')
    ->cols(['name' => 'Updated Name'])
    ->where('id = :id')
    ->bindValue('id', $userId);

$stmt = $pdo->prepare($update->getStatement());
$stmt->execute($update->getBindValues());

// DELETE example
$delete = $queryFactory->newDelete();
$delete
    ->from('users')
    ->where('id = :id')
    ->bindValue('id', $userId);

$stmt = $pdo->prepare($delete->getStatement());
$stmt->execute($delete->getBindValues());
```

## Schema Migration (Future)

When ready to create tables, add SQL files to a `database/` directory or use a migration tool.
