package handler

import (
	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/abhinandpn/Recipta/backend/service"
)

// SheetHandler exposes sheet layout operations to the frontend via Wails bindings.
type SheetHandler struct {
	sheetService *service.SheetService
}

// Init wires the handler's dependencies. Called during app startup.
func (h *SheetHandler) Init(sheetService *service.SheetService) {
	h.sheetService = sheetService
}

// CalculateSheet computes the layout for a given sheet configuration.
func (h *SheetHandler) CalculateSheet(projectID string, totalItems int) (*model.SheetLayout, error) {
	sheet, err := h.sheetService.GetSettings(projectID)
	if err != nil {
		return nil, err
	}
	if sheet == nil {
		// Return default layout
		sheet = &model.SheetSettings{
			PaperSize:    "A4",
			PaperWidth:   210,
			PaperHeight:  297,
			Orientation:  "portrait",
			Rows:         3,
			Columns:      1,
			MarginTop:    10,
			MarginBottom: 10,
			MarginLeft:   10,
			MarginRight:  10,
		}
	}

	cropBleed, err := h.sheetService.GetCropBleed(projectID)
	if err != nil {
		return nil, err
	}

	return h.sheetService.CalculateLayout(sheet, cropBleed, totalItems), nil
}

// SaveSheetSettings persists sheet settings for a project.
func (h *SheetHandler) SaveSheetSettings(settings *model.SheetSettings) error {
	return h.sheetService.SaveSettings(settings)
}

// GetSheetSettings retrieves sheet settings for a project.
func (h *SheetHandler) GetSheetSettings(projectID string) (*model.SheetSettings, error) {
	return h.sheetService.GetSettings(projectID)
}

// SaveCropBleedSettings persists crop/bleed settings for a project.
func (h *SheetHandler) SaveCropBleedSettings(settings *model.CropBleedSettings) error {
	return h.sheetService.SaveCropBleed(settings)
}

// GetCropBleedSettings retrieves crop/bleed settings for a project.
func (h *SheetHandler) GetCropBleedSettings(projectID string) (*model.CropBleedSettings, error) {
	return h.sheetService.GetCropBleed(projectID)
}
