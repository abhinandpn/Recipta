package model

import "time"

// ProjectType distinguishes between the two editing systems.
type ProjectType string

const (
	ProjectTypeReceipt ProjectType = "receipt"
	ProjectTypeFoil    ProjectType = "foil"
)

// Project represents a Recipta project containing all layout, numbering, and print configuration.
type Project struct {
	ID            string      `json:"id"`
	Name          string      `json:"name"`
	Description   string      `json:"description"`
	Type          ProjectType `json:"type"`
	ImagePath     string      `json:"imagePath"`
	ThumbnailPath string      `json:"thumbnailPath"`
	CreatedAt     time.Time   `json:"createdAt"`
	UpdatedAt     time.Time   `json:"updatedAt"`
}

// ProjectFull contains a project with all its related settings loaded.
type ProjectFull struct {
	Project       *Project           `json:"project"`
	Assets        []*Asset           `json:"assets"`
	NumberSetting *NumberSettings    `json:"numberSettings"`
	ManualNumbers []*ManualNumber    `json:"manualNumbers"`
	NumberItems   []*NumberItem      `json:"numberItems"`
	SheetSetting  *SheetSettings     `json:"sheetSettings"`
	CropBleed     *CropBleedSettings `json:"cropBleedSettings"`
	PrintSetting  *PrintSettings     `json:"printSettings"`
	Layers        []*Layer           `json:"layers"`
}
