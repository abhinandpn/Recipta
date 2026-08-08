package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/google/uuid"
)

// NumberRepo provides CRUD operations for number settings, manual numbers, and number items.
type NumberRepo struct {
	db *sql.DB
}

// NewNumberRepo creates a new NumberRepo.
func NewNumberRepo(db *sql.DB) *NumberRepo {
	return &NumberRepo{db: db}
}

// --- Number Settings ---

// CreateSettings inserts number settings for a project.
func (r *NumberRepo) CreateSettings(s *model.NumberSettings) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	now := time.Now()
	s.CreatedAt = now
	s.UpdatedAt = now

	_, err := r.db.Exec(
		`INSERT INTO number_settings (id, project_id, mode, start_number, end_number, step, padding, prefix, suffix, custom_sequence, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.ProjectID, s.Mode, s.StartNumber, s.EndNumber, s.Step, s.Padding, s.Prefix, s.Suffix, s.CustomSequence, s.CreatedAt, s.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create number settings: %w", err)
	}
	return nil
}

// GetSettingsByProjectID retrieves number settings for a project.
func (r *NumberRepo) GetSettingsByProjectID(projectID string) (*model.NumberSettings, error) {
	s := &model.NumberSettings{}
	err := r.db.QueryRow(
		`SELECT id, project_id, mode, start_number, end_number, step, padding, prefix, suffix, custom_sequence, created_at, updated_at
		 FROM number_settings WHERE project_id = ?`, projectID,
	).Scan(&s.ID, &s.ProjectID, &s.Mode, &s.StartNumber, &s.EndNumber, &s.Step, &s.Padding, &s.Prefix, &s.Suffix, &s.CustomSequence, &s.CreatedAt, &s.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil // No settings yet
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get number settings: %w", err)
	}
	return s, nil
}

// UpdateSettings updates existing number settings.
func (r *NumberRepo) UpdateSettings(s *model.NumberSettings) error {
	s.UpdatedAt = time.Now()
	_, err := r.db.Exec(
		`UPDATE number_settings SET mode = ?, start_number = ?, end_number = ?, step = ?, padding = ?, prefix = ?, suffix = ?, custom_sequence = ?, updated_at = ?
		 WHERE project_id = ?`,
		s.Mode, s.StartNumber, s.EndNumber, s.Step, s.Padding, s.Prefix, s.Suffix, s.CustomSequence, s.UpdatedAt, s.ProjectID,
	)
	if err != nil {
		return fmt.Errorf("failed to update number settings: %w", err)
	}
	return nil
}

// UpsertSettings creates or updates number settings for a project.
func (r *NumberRepo) UpsertSettings(s *model.NumberSettings) error {
	existing, err := r.GetSettingsByProjectID(s.ProjectID)
	if err != nil {
		return err
	}
	if existing == nil {
		return r.CreateSettings(s)
	}
	s.ID = existing.ID
	return r.UpdateSettings(s)
}

// --- Manual Numbers ---

// SetManualNumbers replaces all manual numbers for a project.
func (r *NumberRepo) SetManualNumbers(projectID string, numbers []*model.ManualNumber) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Clear existing
	if _, err := tx.Exec(`DELETE FROM manual_numbers WHERE project_id = ?`, projectID); err != nil {
		return fmt.Errorf("failed to clear manual numbers: %w", err)
	}

	// Insert new
	stmt, err := tx.Prepare(
		`INSERT INTO manual_numbers (id, project_id, sequence_order, number_value, is_valid)
		 VALUES (?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, n := range numbers {
		if n.ID == "" {
			n.ID = uuid.New().String()
		}
		n.ProjectID = projectID
		if _, err := stmt.Exec(n.ID, n.ProjectID, n.SequenceOrder, n.NumberValue, n.IsValid); err != nil {
			return fmt.Errorf("failed to insert manual number: %w", err)
		}
	}

	return tx.Commit()
}

// GetManualNumbers retrieves all manual numbers for a project in order.
func (r *NumberRepo) GetManualNumbers(projectID string) ([]*model.ManualNumber, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, sequence_order, number_value, is_valid
		 FROM manual_numbers WHERE project_id = ? ORDER BY sequence_order`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get manual numbers: %w", err)
	}
	defer rows.Close()

	var numbers []*model.ManualNumber
	for rows.Next() {
		n := &model.ManualNumber{}
		if err := rows.Scan(&n.ID, &n.ProjectID, &n.SequenceOrder, &n.NumberValue, &n.IsValid); err != nil {
			return nil, fmt.Errorf("failed to scan manual number: %w", err)
		}
		numbers = append(numbers, n)
	}
	return numbers, rows.Err()
}

// --- Number Items (individual item overrides) ---

// SetNumberItems replaces all number items for a project.
func (r *NumberRepo) SetNumberItems(projectID string, items []*model.NumberItem) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM number_items WHERE project_id = ?`, projectID); err != nil {
		return fmt.Errorf("failed to clear number items: %w", err)
	}

	stmt, err := tx.Prepare(
		`INSERT INTO number_items (id, project_id, item_index, number_value, x, y, width, height, rotation,
		 font_family, font_size, font_style, font_color, letter_spacing, alignment, is_visible, is_locked, is_override, override_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, item := range items {
		if item.ID == "" {
			item.ID = uuid.New().String()
		}
		item.ProjectID = projectID
		if _, err := stmt.Exec(
			item.ID, item.ProjectID, item.ItemIndex, item.NumberValue,
			item.X, item.Y, item.Width, item.Height, item.Rotation,
			item.FontFamily, item.FontSize, item.FontStyle, item.FontColor,
			item.LetterSpacing, item.Alignment, item.IsVisible, item.IsLocked,
			item.IsOverride, item.OverrideJSON,
		); err != nil {
			return fmt.Errorf("failed to insert number item: %w", err)
		}
	}

	return tx.Commit()
}

// GetNumberItems retrieves all number items for a project.
func (r *NumberRepo) GetNumberItems(projectID string) ([]*model.NumberItem, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, item_index, number_value, x, y, width, height, rotation,
		 font_family, font_size, font_style, font_color, letter_spacing, alignment,
		 is_visible, is_locked, is_override, override_json
		 FROM number_items WHERE project_id = ? ORDER BY item_index`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get number items: %w", err)
	}
	defer rows.Close()

	var items []*model.NumberItem
	for rows.Next() {
		item := &model.NumberItem{}
		if err := rows.Scan(
			&item.ID, &item.ProjectID, &item.ItemIndex, &item.NumberValue,
			&item.X, &item.Y, &item.Width, &item.Height, &item.Rotation,
			&item.FontFamily, &item.FontSize, &item.FontStyle, &item.FontColor,
			&item.LetterSpacing, &item.Alignment, &item.IsVisible, &item.IsLocked,
			&item.IsOverride, &item.OverrideJSON,
		); err != nil {
			return nil, fmt.Errorf("failed to scan number item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
