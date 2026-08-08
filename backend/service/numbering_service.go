package service

import (
	"fmt"
	"strings"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/abhinandpn/Recipta/backend/repository"
)

// NumberingService provides number generation and validation logic.
type NumberingService struct {
	numberRepo *repository.NumberRepo
}

// NewNumberingService creates a new NumberingService.
func NewNumberingService(numberRepo *repository.NumberRepo) *NumberingService {
	return &NumberingService{numberRepo: numberRepo}
}

// GenerateSequence generates a list of formatted numbers based on the given settings.
func (s *NumberingService) GenerateSequence(settings *model.NumberSettings) ([]string, error) {
	if settings.Mode == model.NumberModeManual {
		return nil, fmt.Errorf("cannot generate sequence in manual mode")
	}

	if settings.Step <= 0 {
		return nil, fmt.Errorf("step must be greater than 0")
	}
	if settings.StartNumber > settings.EndNumber {
		return nil, fmt.Errorf("start number must be less than or equal to end number")
	}
	if settings.Padding < 0 {
		return nil, fmt.Errorf("padding must be non-negative")
	}

	var numbers []string
	for num := settings.StartNumber; num <= settings.EndNumber; num += settings.Step {
		formatted := fmt.Sprintf("%s%0*d%s", settings.Prefix, settings.Padding, num, settings.Suffix)
		numbers = append(numbers, formatted)
	}

	return numbers, nil
}

// ValidateManualList validates a list of manually entered numbers.
func (s *NumberingService) ValidateManualList(numbers []string) *model.ValidationResult {
	result := &model.ValidationResult{
		IsValid:       true,
		TotalItems:    len(numbers),
		Duplicates:    []string{},
		InvalidValues: []string{},
		Errors:        []string{},
	}

	seen := make(map[string]int) // value -> first occurrence index
	for i, num := range numbers {
		trimmed := strings.TrimSpace(num)
		if trimmed == "" {
			result.InvalidItems++
			result.InvalidValues = append(result.InvalidValues, fmt.Sprintf("Line %d: empty value", i+1))
			result.IsValid = false
			continue
		}

		if firstIdx, exists := seen[trimmed]; exists {
			result.Duplicates = append(result.Duplicates, fmt.Sprintf("'%s' (lines %d and %d)", trimmed, firstIdx+1, i+1))
			result.IsValid = false
		} else {
			seen[trimmed] = i
		}

		result.ValidItems++
	}

	if len(result.Duplicates) > 0 {
		result.Errors = append(result.Errors, fmt.Sprintf("%d duplicate(s) found", len(result.Duplicates)))
	}
	if result.InvalidItems > 0 {
		result.Errors = append(result.Errors, fmt.Sprintf("%d invalid/empty value(s)", result.InvalidItems))
	}

	return result
}

// ParseManualInput parses a newline-separated string into individual number entries.
func (s *NumberingService) ParseManualInput(text string) []string {
	lines := strings.Split(text, "\n")
	var numbers []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			numbers = append(numbers, trimmed)
		}
	}
	return numbers
}

// SaveSettings persists number settings for a project.
func (s *NumberingService) SaveSettings(settings *model.NumberSettings) error {
	return s.numberRepo.UpsertSettings(settings)
}

// GetSettings retrieves number settings for a project.
func (s *NumberingService) GetSettings(projectID string) (*model.NumberSettings, error) {
	return s.numberRepo.GetSettingsByProjectID(projectID)
}

// SaveManualNumbers replaces the manual number list for a project.
func (s *NumberingService) SaveManualNumbers(projectID string, numberValues []string) error {
	numbers := make([]*model.ManualNumber, len(numberValues))
	for i, val := range numberValues {
		trimmed := strings.TrimSpace(val)
		numbers[i] = &model.ManualNumber{
			SequenceOrder: i,
			NumberValue:   trimmed,
			IsValid:       trimmed != "",
		}
	}
	return s.numberRepo.SetManualNumbers(projectID, numbers)
}

// GetManualNumbers retrieves the manual number list for a project.
func (s *NumberingService) GetManualNumbers(projectID string) ([]*model.ManualNumber, error) {
	return s.numberRepo.GetManualNumbers(projectID)
}
