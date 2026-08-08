package repository

import (
	"database/sql"
	"fmt"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/google/uuid"
)

// LayerRepo provides CRUD operations for layers and canvas objects.
type LayerRepo struct {
	db *sql.DB
}

// NewLayerRepo creates a new LayerRepo.
func NewLayerRepo(db *sql.DB) *LayerRepo {
	return &LayerRepo{db: db}
}

// --- Layers ---

// CreateLayer inserts a new layer.
func (r *LayerRepo) CreateLayer(l *model.Layer) error {
	if l.ID == "" {
		l.ID = uuid.New().String()
	}

	_, err := r.db.Exec(
		`INSERT INTO layers (id, project_id, name, order_index, is_visible, is_locked)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		l.ID, l.ProjectID, l.Name, l.OrderIndex, l.IsVisible, l.IsLocked,
	)
	if err != nil {
		return fmt.Errorf("failed to create layer: %w", err)
	}
	return nil
}

// GetLayersByProjectID retrieves all layers for a project, ordered by index.
func (r *LayerRepo) GetLayersByProjectID(projectID string) ([]*model.Layer, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, name, order_index, is_visible, is_locked
		 FROM layers WHERE project_id = ? ORDER BY order_index`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get layers: %w", err)
	}
	defer rows.Close()

	var layers []*model.Layer
	for rows.Next() {
		l := &model.Layer{}
		if err := rows.Scan(&l.ID, &l.ProjectID, &l.Name, &l.OrderIndex, &l.IsVisible, &l.IsLocked); err != nil {
			return nil, fmt.Errorf("failed to scan layer: %w", err)
		}
		layers = append(layers, l)
	}
	return layers, rows.Err()
}

// UpdateLayer updates a layer's properties.
func (r *LayerRepo) UpdateLayer(l *model.Layer) error {
	_, err := r.db.Exec(
		`UPDATE layers SET name = ?, order_index = ?, is_visible = ?, is_locked = ? WHERE id = ?`,
		l.Name, l.OrderIndex, l.IsVisible, l.IsLocked, l.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update layer: %w", err)
	}
	return nil
}

// DeleteLayer removes a layer and its objects.
func (r *LayerRepo) DeleteLayer(id string) error {
	_, err := r.db.Exec(`DELETE FROM layers WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete layer: %w", err)
	}
	return nil
}

// --- Canvas Objects ---

// CreateObject inserts a new canvas object.
func (r *LayerRepo) CreateObject(obj *model.CanvasObject) error {
	if obj.ID == "" {
		obj.ID = uuid.New().String()
	}

	_, err := r.db.Exec(
		`INSERT INTO canvas_objects (id, project_id, layer_id, object_type, x, y, width, height, rotation, properties_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		obj.ID, obj.ProjectID, obj.LayerID, obj.Type, obj.X, obj.Y, obj.Width, obj.Height, obj.Rotation, obj.PropertiesJSON,
	)
	if err != nil {
		return fmt.Errorf("failed to create canvas object: %w", err)
	}
	return nil
}

// GetObjectsByLayerID retrieves all canvas objects for a layer.
func (r *LayerRepo) GetObjectsByLayerID(layerID string) ([]*model.CanvasObject, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, layer_id, object_type, x, y, width, height, rotation, properties_json
		 FROM canvas_objects WHERE layer_id = ?`, layerID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get canvas objects: %w", err)
	}
	defer rows.Close()

	var objects []*model.CanvasObject
	for rows.Next() {
		obj := &model.CanvasObject{}
		if err := rows.Scan(&obj.ID, &obj.ProjectID, &obj.LayerID, &obj.Type, &obj.X, &obj.Y, &obj.Width, &obj.Height, &obj.Rotation, &obj.PropertiesJSON); err != nil {
			return nil, fmt.Errorf("failed to scan canvas object: %w", err)
		}
		objects = append(objects, obj)
	}
	return objects, rows.Err()
}

// GetObjectsByProjectID retrieves all canvas objects for a project.
func (r *LayerRepo) GetObjectsByProjectID(projectID string) ([]*model.CanvasObject, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, layer_id, object_type, x, y, width, height, rotation, properties_json
		 FROM canvas_objects WHERE project_id = ?`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get canvas objects: %w", err)
	}
	defer rows.Close()

	var objects []*model.CanvasObject
	for rows.Next() {
		obj := &model.CanvasObject{}
		if err := rows.Scan(&obj.ID, &obj.ProjectID, &obj.LayerID, &obj.Type, &obj.X, &obj.Y, &obj.Width, &obj.Height, &obj.Rotation, &obj.PropertiesJSON); err != nil {
			return nil, fmt.Errorf("failed to scan canvas object: %w", err)
		}
		objects = append(objects, obj)
	}
	return objects, rows.Err()
}

// UpdateObject updates a canvas object.
func (r *LayerRepo) UpdateObject(obj *model.CanvasObject) error {
	_, err := r.db.Exec(
		`UPDATE canvas_objects SET layer_id = ?, object_type = ?, x = ?, y = ?, width = ?, height = ?, rotation = ?, properties_json = ?
		 WHERE id = ?`,
		obj.LayerID, obj.Type, obj.X, obj.Y, obj.Width, obj.Height, obj.Rotation, obj.PropertiesJSON, obj.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update canvas object: %w", err)
	}
	return nil
}

// DeleteObject removes a canvas object.
func (r *LayerRepo) DeleteObject(id string) error {
	_, err := r.db.Exec(`DELETE FROM canvas_objects WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to delete canvas object: %w", err)
	}
	return nil
}
