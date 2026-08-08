package service

import (
	"math"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/abhinandpn/Recipta/backend/repository"
)

// SheetService handles sheet layout calculations.
type SheetService struct {
	sheetRepo     *repository.SheetRepo
	cropBleedRepo *repository.CropBleedRepo
}

// NewSheetService creates a new SheetService.
func NewSheetService(sheetRepo *repository.SheetRepo, cropBleedRepo *repository.CropBleedRepo) *SheetService {
	return &SheetService{
		sheetRepo:     sheetRepo,
		cropBleedRepo: cropBleedRepo,
	}
}

// CalculateLayout computes the sheet layout based on settings and crop/bleed configuration.
// All dimensions are in millimeters.
func (s *SheetService) CalculateLayout(sheet *model.SheetSettings, cropBleed *model.CropBleedSettings, totalItems int) *model.SheetLayout {
	// Determine effective paper dimensions based on orientation
	paperW := sheet.PaperWidth
	paperH := sheet.PaperHeight
	if sheet.Orientation == "landscape" {
		paperW, paperH = paperH, paperW
	}

	// Calculate printable area (subtract margins)
	printableW := paperW - sheet.MarginLeft - sheet.MarginRight
	printableH := paperH - sheet.MarginTop - sheet.MarginBottom

	// Adjust for bleed if enabled
	bleedAdjust := 0.0
	if cropBleed != nil && cropBleed.BleedEnabled {
		bleedAdjust = cropBleed.BleedSize
	}

	// Calculate item dimensions
	// Total gap space: (cols-1) * hGap for horizontal, (rows-1) * vGap for vertical
	totalHGap := float64(sheet.Columns-1) * sheet.HGap
	totalVGap := float64(sheet.Rows-1) * sheet.VGap

	itemWidth := (printableW - totalHGap) / float64(sheet.Columns)
	itemHeight := (printableH - totalVGap) / float64(sheet.Rows)

	// Items per sheet
	itemsPerSheet := sheet.Rows * sheet.Columns

	// Total sheets calculation
	totalSheets := 0
	remainingItems := 0
	if itemsPerSheet > 0 && totalItems > 0 {
		totalSheets = int(math.Ceil(float64(totalItems) / float64(itemsPerSheet)))
		remainingItems = (totalSheets * itemsPerSheet) - totalItems
	}

	// Calculate positions for each cell on a single sheet
	positions := make([]model.ItemPosition, 0, itemsPerSheet)
	for row := 0; row < sheet.Rows; row++ {
		for col := 0; col < sheet.Columns; col++ {
			x := sheet.MarginLeft + float64(col)*(itemWidth+sheet.HGap) - bleedAdjust
			y := sheet.MarginTop + float64(row)*(itemHeight+sheet.VGap) - bleedAdjust
			w := itemWidth + (2 * bleedAdjust)
			h := itemHeight + (2 * bleedAdjust)

			positions = append(positions, model.ItemPosition{
				Row:    row,
				Col:    col,
				X:      x,
				Y:      y,
				Width:  w,
				Height: h,
			})
		}
	}

	return &model.SheetLayout{
		ItemsPerSheet:   itemsPerSheet,
		TotalSheets:     totalSheets,
		TotalItems:      totalItems,
		RemainingItems:  remainingItems,
		ItemWidth:       itemWidth,
		ItemHeight:      itemHeight,
		PrintableWidth:  printableW,
		PrintableHeight: printableH,
		Positions:       positions,
	}
}

// SaveSettings persists sheet settings for a project.
func (s *SheetService) SaveSettings(settings *model.SheetSettings) error {
	return s.sheetRepo.Upsert(settings)
}

// GetSettings retrieves sheet settings for a project.
func (s *SheetService) GetSettings(projectID string) (*model.SheetSettings, error) {
	return s.sheetRepo.GetByProjectID(projectID)
}

// SaveCropBleed persists crop/bleed settings for a project.
func (s *SheetService) SaveCropBleed(settings *model.CropBleedSettings) error {
	return s.cropBleedRepo.Upsert(settings)
}

// GetCropBleed retrieves crop/bleed settings for a project.
func (s *SheetService) GetCropBleed(projectID string) (*model.CropBleedSettings, error) {
	return s.cropBleedRepo.GetByProjectID(projectID)
}
