package model

import "time"

// PrintSettings stores the print configuration for a project.
type PrintSettings struct {
	ID             string     `json:"id"`
	ProjectID      string     `json:"projectId"`
	PrinterName    string     `json:"printerName"`
	PageRangeStart int        `json:"pageRangeStart"`
	PageRangeEnd   int        `json:"pageRangeEnd"` // 0 means all pages
	Copies         int        `json:"copies"`
	LastPrintedAt  *time.Time `json:"lastPrintedAt"`
}
