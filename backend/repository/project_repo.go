package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/google/uuid"
)

// ProjectRepo provides CRUD operations for projects.
type ProjectRepo struct {
	db *sql.DB
}

// NewProjectRepo creates a new ProjectRepo.
func NewProjectRepo(db *sql.DB) *ProjectRepo {
	return &ProjectRepo{db: db}
}

// Create inserts a new project into the database.
func (r *ProjectRepo) Create(p *model.Project) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	now := time.Now()
	p.CreatedAt = now
	p.UpdatedAt = now

	_, err := r.db.Exec(
		`INSERT INTO projects (id, name, description, type, image_path, thumbnail_path, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Description, p.Type, p.ImagePath, p.ThumbnailPath, p.CreatedAt, p.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create project: %w", err)
	}
	return nil
}

// GetByID retrieves a project by its ID.
func (r *ProjectRepo) GetByID(id string) (*model.Project, error) {
	p := &model.Project{}
	err := r.db.QueryRow(
		`SELECT id, name, description, type, image_path, thumbnail_path, created_at, updated_at
		 FROM projects WHERE id = ?`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Type, &p.ImagePath, &p.ThumbnailPath, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("project not found: %s", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get project: %w", err)
	}
	return p, nil
}

// GetAll retrieves all projects ordered by last updated.
func (r *ProjectRepo) GetAll() ([]*model.Project, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, type, image_path, thumbnail_path, created_at, updated_at
		 FROM projects ORDER BY updated_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list projects: %w", err)
	}
	defer rows.Close()

	var projects []*model.Project
	for rows.Next() {
		p := &model.Project{}
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Type, &p.ImagePath, &p.ThumbnailPath, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan project: %w", err)
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// Update updates an existing project.
func (r *ProjectRepo) Update(p *model.Project) error {
	p.UpdatedAt = time.Now()
	result, err := r.db.Exec(
		`UPDATE projects SET name = ?, description = ?, type = ?, image_path = ?, thumbnail_path = ?, updated_at = ?
		 WHERE id = ?`,
		p.Name, p.Description, p.Type, p.ImagePath, p.ThumbnailPath, p.UpdatedAt, p.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update project: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("project not found: %s", p.ID)
	}
	return nil
}

// Delete removes a project from the database.
func (r *ProjectRepo) Delete(id string) error {
	result, err := r.db.Exec(`DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete project: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("project not found: %s", id)
	}
	return nil
}

// GetRecent retrieves the most recently opened projects.
func (r *ProjectRepo) GetRecent(limit int) ([]*model.Project, error) {
	rows, err := r.db.Query(
		`SELECT p.id, p.name, p.description, p.type, p.image_path, p.thumbnail_path, p.created_at, p.updated_at
		 FROM projects p
		 INNER JOIN recent_projects rp ON p.id = rp.project_id
		 ORDER BY rp.opened_at DESC
		 LIMIT ?`, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get recent projects: %w", err)
	}
	defer rows.Close()

	var projects []*model.Project
	for rows.Next() {
		p := &model.Project{}
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Type, &p.ImagePath, &p.ThumbnailPath, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan project: %w", err)
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// RecordRecentOpen adds or updates a project's last-opened timestamp.
func (r *ProjectRepo) RecordRecentOpen(projectID string) error {
	id := uuid.New().String()
	// Delete existing entry for this project first, then insert new one
	_, _ = r.db.Exec(`DELETE FROM recent_projects WHERE project_id = ?`, projectID)
	_, err := r.db.Exec(
		`INSERT INTO recent_projects (id, project_id, opened_at) VALUES (?, ?, ?)`,
		id, projectID, time.Now(),
	)
	if err != nil {
		return fmt.Errorf("failed to record recent open: %w", err)
	}
	return nil
}
