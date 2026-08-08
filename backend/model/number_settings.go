package model

import "time"

// NumberMode specifies whether numbers are generated automatically or provided manually.
type NumberMode string

const (
	NumberModeAuto   NumberMode = "auto"
	NumberModeManual NumberMode = "manual"
)

// NumberSettings stores the numbering configuration for a project.
type NumberSettings struct {
	ID             string     `json:"id"`
	ProjectID      string     `json:"projectId"`
	Mode           NumberMode `json:"mode"`
	StartNumber    int        `json:"startNumber"`
	EndNumber      int        `json:"endNumber"`
	Step           int        `json:"step"`
	Padding        int        `json:"padding"`
	Prefix         string     `json:"prefix"`
	Suffix         string     `json:"suffix"`
	CustomSequence string     `json:"customSequence"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

// ManualNumber represents a single user-entered number in the manual list.
type ManualNumber struct {
	ID            string `json:"id"`
	ProjectID     string `json:"projectId"`
	SequenceOrder int    `json:"sequenceOrder"`
	NumberValue   string `json:"numberValue"`
	IsValid       bool   `json:"isValid"`
}

// ValidationResult holds the result of validating a manual number list.
type ValidationResult struct {
	IsValid       bool     `json:"isValid"`
	TotalItems    int      `json:"totalItems"`
	ValidItems    int      `json:"validItems"`
	InvalidItems  int      `json:"invalidItems"`
	Duplicates    []string `json:"duplicates"`
	InvalidValues []string `json:"invalidValues"`
	Errors        []string `json:"errors"`
}
