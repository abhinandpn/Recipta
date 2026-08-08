package repository

import (
	"database/sql"
	"fmt"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/google/uuid"
)

// PrintRepo provides CRUD operations for print settings.
type PrintRepo struct {
	db *sql.DB
}

// NewPrintRepo creates a new PrintRepo.
func NewPrintRepo(db *sql.DB) *PrintRepo {
	return &PrintRepo{db: db}
}

// Create inserts print settings for a project.
func (r *PrintRepo) Create(s *model.PrintSettings) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}

	_, err := r.db.Exec(
		`INSERT INTO print_settings (id, project_id, printer_name, page_range_start, page_range_end, copies, last_printed_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.ProjectID, s.PrinterName, s.PageRangeStart, s.PageRangeEnd, s.Copies, s.LastPrintedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create print settings: %w", err)
	}
	return nil
}

// GetByProjectID retrieves print settings for a project.
func (r *PrintRepo) GetByProjectID(projectID string) (*model.PrintSettings, error) {
	s := &model.PrintSettings{}
	err := r.db.QueryRow(
		`SELECT id, project_id, printer_name, page_range_start, page_range_end, copies, last_printed_at
		 FROM print_settings WHERE project_id = ?`, projectID,
	).Scan(&s.ID, &s.ProjectID, &s.PrinterName, &s.PageRangeStart, &s.PageRangeEnd, &s.Copies, &s.LastPrintedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get print settings: %w", err)
	}
	return s, nil
}

// Upsert creates or updates print settings.
func (r *PrintRepo) Upsert(s *model.PrintSettings) error {
	existing, err := r.GetByProjectID(s.ProjectID)
	if err != nil {
		return err
	}
	if existing == nil {
		return r.Create(s)
	}
	s.ID = existing.ID
	_, err = r.db.Exec(
		`UPDATE print_settings SET printer_name = ?, page_range_start = ?, page_range_end = ?, copies = ?, last_printed_at = ?
		 WHERE project_id = ?`,
		s.PrinterName, s.PageRangeStart, s.PageRangeEnd, s.Copies, s.LastPrintedAt, s.ProjectID,
	)
	if err != nil {
		return fmt.Errorf("failed to update print settings: %w", err)
	}
	return nil
}
