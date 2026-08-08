package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Database wraps the SQLite connection and provides lifecycle management.
type Database struct {
	DB     *sql.DB
	dbPath string
}

// New creates or opens a SQLite database at the given path.
// It creates parent directories if they don't exist.
func New(dbPath string) (*Database, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable WAL mode for better concurrent read performance
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to set WAL mode: %w", err)
	}

	// Enable foreign keys
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Verify connection
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &Database{
		DB:     db,
		dbPath: dbPath,
	}, nil
}

// Close cleanly shuts down the database connection.
func (d *Database) Close() error {
	if d.DB != nil {
		return d.DB.Close()
	}
	return nil
}

// Path returns the filesystem path of the database file.
func (d *Database) Path() string {
	return d.dbPath
}

// GetDefaultDBPath returns the default database path inside the user's app data directory.
func GetDefaultDBPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	return filepath.Join(homeDir, ".recipta", "recipta.db"), nil
}

// GetProjectStoragePath returns the directory where project assets are stored.
func GetProjectStoragePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	path := filepath.Join(homeDir, ".recipta", "projects")
	if err := os.MkdirAll(path, 0755); err != nil {
		return "", fmt.Errorf("failed to create projects directory: %w", err)
	}

	return path, nil
}
