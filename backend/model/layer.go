package model

// Layer represents a canvas layer that can contain multiple objects.
type Layer struct {
	ID         string          `json:"id"`
	ProjectID  string          `json:"projectId"`
	Name       string          `json:"name"`
	OrderIndex int             `json:"orderIndex"`
	IsVisible  bool            `json:"isVisible"`
	IsLocked   bool            `json:"isLocked"`
	Objects    []*CanvasObject `json:"objects,omitempty"` // populated when loading full layer
}
