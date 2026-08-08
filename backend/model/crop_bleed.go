package model

// CropBleedSettings stores crop mark and bleed configuration.
type CropBleedSettings struct {
	ID               string  `json:"id"`
	ProjectID        string  `json:"projectId"`
	CropMarksEnabled bool    `json:"cropMarksEnabled"`
	BleedEnabled     bool    `json:"bleedEnabled"`
	BleedSize        float64 `json:"bleedSize"`       // mm
	CropMarkLength   float64 `json:"cropMarkLength"`  // mm
	CropMarkOffset   float64 `json:"cropMarkOffset"`  // mm
}
