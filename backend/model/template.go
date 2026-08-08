package model

import "time"

// Template represents a reusable project configuration that can be applied to new projects.
type Template struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Type          string    `json:"type"` // gift_coupon, receipt, event_ticket, voucher, token, custom
	ConfigJSON    string    `json:"configJson"`
	ThumbnailPath string    `json:"thumbnailPath"`
	CreatedAt     time.Time `json:"createdAt"`
}
