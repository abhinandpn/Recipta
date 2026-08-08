package repository

import (
	"database/sql"
	"fmt"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/google/uuid"
)

// SheetRepo provides CRUD operations for sheet settings.
type SheetRepo struct {
	db *sql.DB
}

// NewSheetRepo creates a new SheetRepo.
func NewSheetRepo(db *sql.DB) *SheetRepo {
	return &SheetRepo{db: db}
}

// Create inserts sheet settings for a project.
func (r *SheetRepo) Create(s *model.SheetSettings) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}

	_, err := r.db.Exec(
		`INSERT INTO sheet_settings (id, project_id, paper_size, paper_width, paper_height, orientation,
		 rows, columns, h_gap, v_gap, margin_top, margin_bottom, margin_left, margin_right, rotation)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.ProjectID, s.PaperSize, s.PaperWidth, s.PaperHeight, s.Orientation,
		s.Rows, s.Columns, s.HGap, s.VGap,
		s.MarginTop, s.MarginBottom, s.MarginLeft, s.MarginRight, s.Rotation,
	)
	if err != nil {
		return fmt.Errorf("failed to create sheet settings: %w", err)
	}
	return nil
}

// GetByProjectID retrieves sheet settings for a project.
func (r *SheetRepo) GetByProjectID(projectID string) (*model.SheetSettings, error) {
	s := &model.SheetSettings{}
	err := r.db.QueryRow(
		`SELECT id, project_id, paper_size, paper_width, paper_height, orientation,
		 rows, columns, h_gap, v_gap, margin_top, margin_bottom, margin_left, margin_right, rotation
		 FROM sheet_settings WHERE project_id = ?`, projectID,
	).Scan(
		&s.ID, &s.ProjectID, &s.PaperSize, &s.PaperWidth, &s.PaperHeight, &s.Orientation,
		&s.Rows, &s.Columns, &s.HGap, &s.VGap,
		&s.MarginTop, &s.MarginBottom, &s.MarginLeft, &s.MarginRight, &s.Rotation,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get sheet settings: %w", err)
	}
	return s, nil
}

// Upsert creates or updates sheet settings for a project.
func (r *SheetRepo) Upsert(s *model.SheetSettings) error {
	existing, err := r.GetByProjectID(s.ProjectID)
	if err != nil {
		return err
	}
	if existing == nil {
		return r.Create(s)
	}
	s.ID = existing.ID
	_, err = r.db.Exec(
		`UPDATE sheet_settings SET paper_size = ?, paper_width = ?, paper_height = ?, orientation = ?,
		 rows = ?, columns = ?, h_gap = ?, v_gap = ?,
		 margin_top = ?, margin_bottom = ?, margin_left = ?, margin_right = ?, rotation = ?
		 WHERE project_id = ?`,
		s.PaperSize, s.PaperWidth, s.PaperHeight, s.Orientation,
		s.Rows, s.Columns, s.HGap, s.VGap,
		s.MarginTop, s.MarginBottom, s.MarginLeft, s.MarginRight, s.Rotation,
		s.ProjectID,
	)
	if err != nil {
		return fmt.Errorf("failed to update sheet settings: %w", err)
	}
	return nil
}
