package model

// SheetSettings stores the paper/layout configuration for a project.
type SheetSettings struct {
	ID           string  `json:"id"`
	ProjectID    string  `json:"projectId"`
	PaperSize    string  `json:"paperSize"`   // A4, A3, Letter, Legal, Custom
	PaperWidth   float64 `json:"paperWidth"`  // mm
	PaperHeight  float64 `json:"paperHeight"` // mm
	Orientation  string  `json:"orientation"` // portrait, landscape
	Rows         int     `json:"rows"`
	Columns      int     `json:"columns"`
	HGap         float64 `json:"hGap"`         // mm
	VGap         float64 `json:"vGap"`         // mm
	MarginTop    float64 `json:"marginTop"`    // mm
	MarginBottom float64 `json:"marginBottom"` // mm
	MarginLeft   float64 `json:"marginLeft"`   // mm
	MarginRight  float64 `json:"marginRight"`  // mm
	Rotation     float64 `json:"rotation"`
}

// SheetLayout is the calculated result of applying sheet settings + crop/bleed.
type SheetLayout struct {
	ItemsPerSheet   int            `json:"itemsPerSheet"`
	TotalSheets     int            `json:"totalSheets"`
	TotalItems      int            `json:"totalItems"`
	RemainingItems  int            `json:"remainingItems"`
	ItemWidth       float64        `json:"itemWidth"`  // mm
	ItemHeight      float64        `json:"itemHeight"` // mm
	PrintableWidth  float64        `json:"printableWidth"`
	PrintableHeight float64        `json:"printableHeight"`
	Positions       []ItemPosition `json:"positions"` // position of each item on a single sheet
}

// ItemPosition represents the position of an item on a sheet.
type ItemPosition struct {
	Row    int     `json:"row"`
	Col    int     `json:"col"`
	X      float64 `json:"x"`      // mm from left edge
	Y      float64 `json:"y"`      // mm from top edge
	Width  float64 `json:"width"`  // mm
	Height float64 `json:"height"` // mm
}
