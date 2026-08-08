package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/google/uuid"
)

// AssetRepo provides CRUD operations for project assets (imported images).
type AssetRepo struct {
	db *sql.DB
}

// NewAssetRepo creates a new AssetRepo.
func NewAssetRepo(db *sql.DB) *AssetRepo {
	return &AssetRepo{db: db}
}

// Create inserts a new asset.
func (r *AssetRepo) Create(a *model.Asset) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	a.CreatedAt = time.Now()

	_, err := r.db.Exec(
		`INSERT INTO assets (id, project_id, original_filename, stored_path, file_type, width, height, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.ProjectID, a.OriginalFilename, a.StoredPath, a.FileType, a.Width, a.Height, a.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create asset: %w", err)
	}
	return nil
}

// GetByProjectID retrieves all assets for a project.
func (r *AssetRepo) GetByProjectID(projectID string) ([]*model.Asset, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, original_filename, stored_path, file_type, width, height, created_at
		 FROM assets WHERE project_id = ? ORDER BY created_at DESC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get assets: %w", err)
	}
	defer rows.Close()

	var assets []*model.Asset
	for rows.Next() {
		a := &model.Asset{}
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.OriginalFilename, &a.StoredPath, &a.FileType, &a.Width, &a.Height, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan asset: %w", err)
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

// Delete removes an asset.
func (r *AssetRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM assets WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete asset: %w", err)
	}
	return nil
}
