package model

// NumberItem represents an individual numbered item with its own position and style.
// When is_override is true, this item's settings take precedence over the auto-generated values.
type NumberItem struct {
	ID            string  `json:"id"`
	ProjectID     string  `json:"projectId"`
	ItemIndex     int     `json:"itemIndex"`
	NumberValue   string  `json:"numberValue"`
	X             float64 `json:"x"`
	Y             float64 `json:"y"`
	Width         float64 `json:"width"`
	Height        float64 `json:"height"`
	Rotation      float64 `json:"rotation"`
	FontFamily    string  `json:"fontFamily"`
	FontSize      float64 `json:"fontSize"`
	FontStyle     string  `json:"fontStyle"` // normal, bold, italic, bold-italic
	FontColor     string  `json:"fontColor"` // hex color
	LetterSpacing float64 `json:"letterSpacing"`
	Alignment     string  `json:"alignment"` // left, center, right
	IsVisible     bool    `json:"isVisible"`
	IsLocked      bool    `json:"isLocked"`
	IsOverride    bool    `json:"isOverride"`
	OverrideJSON  string  `json:"overrideJson"` // stores any extra override properties
}
