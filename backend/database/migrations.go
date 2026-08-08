package database

import (
	"database/sql"
	"fmt"
)

// RunMigrations creates all tables if they don't exist.
// Uses IF NOT EXISTS so it's safe to call on every startup.
func RunMigrations(db *sql.DB) error {
	for _, stmt := range migrationStatements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("migration failed: %w\nStatement: %s", err, stmt)
		}
	}
	return nil
}

var migrationStatements = []string{
	// Projects table
	`CREATE TABLE IF NOT EXISTS projects (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT DEFAULT '',
		type TEXT NOT NULL CHECK(type IN ('receipt', 'foil')),
		image_path TEXT DEFAULT '',
		thumbnail_path TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`,

	// Templates table
	`CREATE TABLE IF NOT EXISTS templates (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT DEFAULT '',
		type TEXT NOT NULL,
		config_json TEXT DEFAULT '{}',
		thumbnail_path TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`,

	// Assets table — stores imported images
	`CREATE TABLE IF NOT EXISTS assets (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		original_filename TEXT NOT NULL,
		stored_path TEXT NOT NULL,
		file_type TEXT NOT NULL,
		width INTEGER DEFAULT 0,
		height INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Number settings — one per project
	`CREATE TABLE IF NOT EXISTS number_settings (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL UNIQUE,
		mode TEXT NOT NULL DEFAULT 'auto' CHECK(mode IN ('auto', 'manual')),
		start_number INTEGER DEFAULT 1,
		end_number INTEGER DEFAULT 100,
		step INTEGER DEFAULT 1,
		padding INTEGER DEFAULT 4,
		prefix TEXT DEFAULT '',
		suffix TEXT DEFAULT '',
		custom_sequence TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Manual numbers — user-entered number list
	`CREATE TABLE IF NOT EXISTS manual_numbers (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		sequence_order INTEGER NOT NULL,
		number_value TEXT NOT NULL,
		is_valid INTEGER DEFAULT 1,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Number items — individual item overrides
	`CREATE TABLE IF NOT EXISTS number_items (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		item_index INTEGER NOT NULL,
		number_value TEXT NOT NULL,
		x REAL DEFAULT 0,
		y REAL DEFAULT 0,
		width REAL DEFAULT 100,
		height REAL DEFAULT 30,
		rotation REAL DEFAULT 0,
		font_family TEXT DEFAULT 'Inter',
		font_size REAL DEFAULT 14,
		font_style TEXT DEFAULT 'normal',
		font_color TEXT DEFAULT '#FFFFFF',
		letter_spacing REAL DEFAULT 0,
		alignment TEXT DEFAULT 'center',
		is_visible INTEGER DEFAULT 1,
		is_locked INTEGER DEFAULT 0,
		is_override INTEGER DEFAULT 0,
		override_json TEXT DEFAULT '{}',
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Sheet settings — paper/layout configuration
	`CREATE TABLE IF NOT EXISTS sheet_settings (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL UNIQUE,
		paper_size TEXT DEFAULT 'A4',
		paper_width REAL DEFAULT 210,
		paper_height REAL DEFAULT 297,
		orientation TEXT DEFAULT 'portrait' CHECK(orientation IN ('portrait', 'landscape')),
		rows INTEGER DEFAULT 3,
		columns INTEGER DEFAULT 1,
		h_gap REAL DEFAULT 0,
		v_gap REAL DEFAULT 0,
		margin_top REAL DEFAULT 10,
		margin_bottom REAL DEFAULT 10,
		margin_left REAL DEFAULT 10,
		margin_right REAL DEFAULT 10,
		rotation REAL DEFAULT 0,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Crop and bleed settings
	`CREATE TABLE IF NOT EXISTS crop_bleed_settings (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL UNIQUE,
		crop_marks_enabled INTEGER DEFAULT 0,
		bleed_enabled INTEGER DEFAULT 0,
		bleed_size REAL DEFAULT 3,
		crop_mark_length REAL DEFAULT 5,
		crop_mark_offset REAL DEFAULT 2,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Print settings
	`CREATE TABLE IF NOT EXISTS print_settings (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL UNIQUE,
		printer_name TEXT DEFAULT '',
		page_range_start INTEGER DEFAULT 1,
		page_range_end INTEGER DEFAULT 0,
		copies INTEGER DEFAULT 1,
		last_printed_at DATETIME,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Layers
	`CREATE TABLE IF NOT EXISTS layers (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		name TEXT NOT NULL,
		order_index INTEGER DEFAULT 0,
		is_visible INTEGER DEFAULT 1,
		is_locked INTEGER DEFAULT 0,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Canvas objects
	`CREATE TABLE IF NOT EXISTS canvas_objects (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		layer_id TEXT NOT NULL,
		object_type TEXT NOT NULL,
		x REAL DEFAULT 0,
		y REAL DEFAULT 0,
		width REAL DEFAULT 100,
		height REAL DEFAULT 100,
		rotation REAL DEFAULT 0,
		properties_json TEXT DEFAULT '{}',
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
		FOREIGN KEY (layer_id) REFERENCES layers(id) ON DELETE CASCADE
	)`,

	// Recent projects — tracks last opened
	`CREATE TABLE IF NOT EXISTS recent_projects (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	)`,

	// Indexes for performance
	`CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id)`,
	`CREATE INDEX IF NOT EXISTS idx_manual_numbers_project ON manual_numbers(project_id)`,
	`CREATE INDEX IF NOT EXISTS idx_number_items_project ON number_items(project_id)`,
	`CREATE INDEX IF NOT EXISTS idx_layers_project ON layers(project_id)`,
	`CREATE INDEX IF NOT EXISTS idx_canvas_objects_project ON canvas_objects(project_id)`,
	`CREATE INDEX IF NOT EXISTS idx_canvas_objects_layer ON canvas_objects(layer_id)`,
	`CREATE INDEX IF NOT EXISTS idx_recent_projects_opened ON recent_projects(opened_at DESC)`,
}
