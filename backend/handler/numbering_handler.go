package handler

import (
	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/abhinandpn/Recipta/backend/service"
)

// NumberingHandler exposes numbering operations to the frontend via Wails bindings.
type NumberingHandler struct {
	numberingService *service.NumberingService
}

// Init wires the handler's dependencies. Called during app startup.
func (h *NumberingHandler) Init(numberingService *service.NumberingService) {
	h.numberingService = numberingService
}

// GenerateNumbers generates a sequence of formatted numbers based on settings.
func (h *NumberingHandler) GenerateNumbers(projectID string) ([]string, error) {
	settings, err := h.numberingService.GetSettings(projectID)
	if err != nil {
		return nil, err
	}
	if settings == nil {
		return []string{}, nil
	}
	return h.numberingService.GenerateSequence(settings)
}

// ValidateManualNumbers validates a list of manually entered numbers.
func (h *NumberingHandler) ValidateManualNumbers(numbers []string) *model.ValidationResult {
	return h.numberingService.ValidateManualList(numbers)
}

// ParseManualInput parses newline-separated text into number entries.
func (h *NumberingHandler) ParseManualInput(text string) []string {
	return h.numberingService.ParseManualInput(text)
}

// SaveNumberSettings persists number settings for a project.
func (h *NumberingHandler) SaveNumberSettings(settings *model.NumberSettings) error {
	return h.numberingService.SaveSettings(settings)
}

// GetNumberSettings retrieves number settings for a project.
func (h *NumberingHandler) GetNumberSettings(projectID string) (*model.NumberSettings, error) {
	return h.numberingService.GetSettings(projectID)
}

// SaveManualNumbers saves the manual number list for a project.
func (h *NumberingHandler) SaveManualNumbers(projectID string, numbers []string) error {
	return h.numberingService.SaveManualNumbers(projectID, numbers)
}

// GetManualNumbers retrieves the manual number list for a project.
func (h *NumberingHandler) GetManualNumbers(projectID string) ([]*model.ManualNumber, error) {
	return h.numberingService.GetManualNumbers(projectID)
}
