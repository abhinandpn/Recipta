package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/google/uuid"
)

// TemplateRepo provides CRUD operations for templates.
type TemplateRepo struct {
	db *sql.DB
}

// NewTemplateRepo creates a new TemplateRepo.
func NewTemplateRepo(db *sql.DB) *TemplateRepo {
	return &TemplateRepo{db: db}
}

// Create inserts a new template.
func (r *TemplateRepo) Create(t *model.Template) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	t.CreatedAt = time.Now()

	_, err := r.db.Exec(
		`INSERT INTO templates (id, name, description, type, config_json, thumbnail_path, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.Name, t.Description, t.Type, t.ConfigJSON, t.ThumbnailPath, t.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create template: %w", err)
	}
	return nil
}

// GetByID retrieves a template by ID.
func (r *TemplateRepo) GetByID(id string) (*model.Template, error) {
	t := &model.Template{}
	err := r.db.QueryRow(
		`SELECT id, name, description, type, config_json, thumbnail_path, created_at
		 FROM templates WHERE id = ?`, id,
	).Scan(&t.ID, &t.Name, &t.Description, &t.Type, &t.ConfigJSON, &t.ThumbnailPath, &t.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("template not found: %s", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get template: %w", err)
	}
	return t, nil
}

// GetAll retrieves all templates.
func (r *TemplateRepo) GetAll() ([]*model.Template, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, type, config_json, thumbnail_path, created_at
		 FROM templates ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}
	defer rows.Close()

	var templates []*model.Template
	for rows.Next() {
		t := &model.Template{}
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.Type, &t.ConfigJSON, &t.ThumbnailPath, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan template: %w", err)
		}
		templates = append(templates, t)
	}
	return templates, rows.Err()
}

// Delete removes a template.
func (r *TemplateRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM templates WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete template: %w", err)
	}
	return nil
}
