package model

import "time"

// Asset represents an imported image file associated with a project.
// The original image is never modified — edits are stored separately.
type Asset struct {
	ID               string    `json:"id"`
	ProjectID        string    `json:"projectId"`
	OriginalFilename string    `json:"originalFilename"`
	StoredPath       string    `json:"storedPath"`
	FileType         string    `json:"fileType"` // png, jpg, svg, etc.
	Width            int       `json:"width"`
	Height           int       `json:"height"`
	CreatedAt        time.Time `json:"createdAt"`
}
