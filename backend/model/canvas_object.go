package model

// ObjectType identifies the kind of object on the canvas.
type ObjectType string

const (
	ObjectTypeImage  ObjectType = "image"
	ObjectTypeNumber ObjectType = "number"
	ObjectTypeText   ObjectType = "text"
	ObjectTypeShape  ObjectType = "shape"
	ObjectTypeGuide  ObjectType = "guide"
)

// CanvasObject represents a visual element on the canvas.
type CanvasObject struct {
	ID             string     `json:"id"`
	ProjectID      string     `json:"projectId"`
	LayerID        string     `json:"layerId"`
	Type           ObjectType `json:"type"`
	X              float64    `json:"x"`
	Y              float64    `json:"y"`
	Width          float64    `json:"width"`
	Height         float64    `json:"height"`
	Rotation       float64    `json:"rotation"`
	PropertiesJSON string     `json:"propertiesJson"` // type-specific properties
}
