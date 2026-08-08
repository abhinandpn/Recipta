package repository

import (
	"database/sql"
	"fmt"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/google/uuid"
)

// CropBleedRepo provides CRUD operations for crop and bleed settings.
type CropBleedRepo struct {
	db *sql.DB
}

// NewCropBleedRepo creates a new CropBleedRepo.
func NewCropBleedRepo(db *sql.DB) *CropBleedRepo {
	return &CropBleedRepo{db: db}
}

// Create inserts crop/bleed settings for a project.
func (r *CropBleedRepo) Create(s *model.CropBleedSettings) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}

	_, err := r.db.Exec(
		`INSERT INTO crop_bleed_settings (id, project_id, crop_marks_enabled, bleed_enabled, bleed_size, crop_mark_length, crop_mark_offset)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.ProjectID, s.CropMarksEnabled, s.BleedEnabled, s.BleedSize, s.CropMarkLength, s.CropMarkOffset,
	)
	if err != nil {
		return fmt.Errorf("failed to create crop/bleed settings: %w", err)
	}
	return nil
}

// GetByProjectID retrieves crop/bleed settings for a project.
func (r *CropBleedRepo) GetByProjectID(projectID string) (*model.CropBleedSettings, error) {
	s := &model.CropBleedSettings{}
	err := r.db.QueryRow(
		`SELECT id, project_id, crop_marks_enabled, bleed_enabled, bleed_size, crop_mark_length, crop_mark_offset
		 FROM crop_bleed_settings WHERE project_id = ?`, projectID,
	).Scan(&s.ID, &s.ProjectID, &s.CropMarksEnabled, &s.BleedEnabled, &s.BleedSize, &s.CropMarkLength, &s.CropMarkOffset)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get crop/bleed settings: %w", err)
	}
	return s, nil
}

// Upsert creates or updates crop/bleed settings.
func (r *CropBleedRepo) Upsert(s *model.CropBleedSettings) error {
	existing, err := r.GetByProjectID(s.ProjectID)
	if err != nil {
		return err
	}
	if existing == nil {
		return r.Create(s)
	}
	s.ID = existing.ID
	_, err = r.db.Exec(
		`UPDATE crop_bleed_settings SET crop_marks_enabled = ?, bleed_enabled = ?, bleed_size = ?, crop_mark_length = ?, crop_mark_offset = ?
		 WHERE project_id = ?`,
		s.CropMarksEnabled, s.BleedEnabled, s.BleedSize, s.CropMarkLength, s.CropMarkOffset, s.ProjectID,
	)
	if err != nil {
		return fmt.Errorf("failed to update crop/bleed settings: %w", err)
	}
	return nil
}
