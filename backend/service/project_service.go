package service

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/abhinandpn/Recipta/backend/repository"
	"github.com/google/uuid"
)

// ProjectService orchestrates project lifecycle operations.
type ProjectService struct {
	projectRepo   *repository.ProjectRepo
	assetRepo     *repository.AssetRepo
	numberRepo    *repository.NumberRepo
	sheetRepo     *repository.SheetRepo
	cropBleedRepo *repository.CropBleedRepo
	printRepo     *repository.PrintRepo
	layerRepo     *repository.LayerRepo
	storagePath   string
}

// NewProjectService creates a new ProjectService.
func NewProjectService(
	projectRepo *repository.ProjectRepo,
	assetRepo *repository.AssetRepo,
	numberRepo *repository.NumberRepo,
	sheetRepo *repository.SheetRepo,
	cropBleedRepo *repository.CropBleedRepo,
	printRepo *repository.PrintRepo,
	layerRepo *repository.LayerRepo,
	storagePath string,
) *ProjectService {
	return &ProjectService{
		projectRepo:   projectRepo,
		assetRepo:     assetRepo,
		numberRepo:    numberRepo,
		sheetRepo:     sheetRepo,
		cropBleedRepo: cropBleedRepo,
		printRepo:     printRepo,
		layerRepo:     layerRepo,
		storagePath:   storagePath,
	}
}

// CreateProject creates a new project with default settings.
func (s *ProjectService) CreateProject(name string, projectType model.ProjectType, description string) (*model.Project, error) {
	if name == "" {
		return nil, fmt.Errorf("project name is required")
	}
	if projectType != model.ProjectTypeReceipt && projectType != model.ProjectTypeFoil {
		return nil, fmt.Errorf("invalid project type: %s (must be 'receipt' or 'foil')", projectType)
	}

	project := &model.Project{
		ID:          uuid.New().String(),
		Name:        name,
		Description: description,
		Type:        projectType,
	}

	// Create project directory for assets
	projectDir := filepath.Join(s.storagePath, project.ID)
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create project directory: %w", err)
	}

	// Save project to database
	if err := s.projectRepo.Create(project); err != nil {
		os.RemoveAll(projectDir) // Cleanup on failure
		return nil, err
	}

	// Create default number settings
	defaultNumberSettings := &model.NumberSettings{
		ProjectID:   project.ID,
		Mode:        model.NumberModeAuto,
		StartNumber: 1,
		EndNumber:   100,
		Step:        1,
		Padding:     4,
	}
	if err := s.numberRepo.CreateSettings(defaultNumberSettings); err != nil {
		return nil, fmt.Errorf("failed to create default number settings: %w", err)
	}

	// Create default sheet settings (A4 portrait)
	defaultSheetSettings := &model.SheetSettings{
		ProjectID:    project.ID,
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
	if err := s.sheetRepo.Create(defaultSheetSettings); err != nil {
		return nil, fmt.Errorf("failed to create default sheet settings: %w", err)
	}

	// Create default crop/bleed settings
	defaultCropBleed := &model.CropBleedSettings{
		ProjectID:      project.ID,
		BleedSize:      3,
		CropMarkLength: 5,
		CropMarkOffset: 2,
	}
	if err := s.cropBleedRepo.Create(defaultCropBleed); err != nil {
		return nil, fmt.Errorf("failed to create default crop/bleed settings: %w", err)
	}

	// Create default print settings
	defaultPrintSettings := &model.PrintSettings{
		ProjectID:      project.ID,
		PageRangeStart: 1,
		Copies:         1,
	}
	if err := s.printRepo.Create(defaultPrintSettings); err != nil {
		return nil, fmt.Errorf("failed to create default print settings: %w", err)
	}

	// Create default layer
	defaultLayer := &model.Layer{
		ProjectID:  project.ID,
		Name:       "Layer 1",
		OrderIndex: 0,
		IsVisible:  true,
		IsLocked:   false,
	}
	if err := s.layerRepo.CreateLayer(defaultLayer); err != nil {
		return nil, fmt.Errorf("failed to create default layer: %w", err)
	}

	// Record as recent project
	_ = s.projectRepo.RecordRecentOpen(project.ID)

	return project, nil
}

// GetProject retrieves a project by ID.
func (s *ProjectService) GetProject(id string) (*model.Project, error) {
	return s.projectRepo.GetByID(id)
}

// GetProjectFull retrieves a project with all related settings.
func (s *ProjectService) GetProjectFull(id string) (*model.ProjectFull, error) {
	project, err := s.projectRepo.GetByID(id)
	if err != nil {
		return nil, err
	}

	assets, err := s.assetRepo.GetByProjectID(id)
	if err != nil {
		return nil, err
	}

	numberSettings, err := s.numberRepo.GetSettingsByProjectID(id)
	if err != nil {
		return nil, err
	}

	manualNumbers, err := s.numberRepo.GetManualNumbers(id)
	if err != nil {
		return nil, err
	}

	numberItems, err := s.numberRepo.GetNumberItems(id)
	if err != nil {
		return nil, err
	}

	sheetSettings, err := s.sheetRepo.GetByProjectID(id)
	if err != nil {
		return nil, err
	}

	cropBleed, err := s.cropBleedRepo.GetByProjectID(id)
	if err != nil {
		return nil, err
	}

	printSettings, err := s.printRepo.GetByProjectID(id)
	if err != nil {
		return nil, err
	}

	layers, err := s.layerRepo.GetLayersByProjectID(id)
	if err != nil {
		return nil, err
	}

	// Load objects for each layer
	for _, layer := range layers {
		objects, err := s.layerRepo.GetObjectsByLayerID(layer.ID)
		if err != nil {
			return nil, err
		}
		layer.Objects = objects
	}

	// Record as recently opened
	_ = s.projectRepo.RecordRecentOpen(id)

	return &model.ProjectFull{
		Project:       project,
		Assets:        assets,
		NumberSetting: numberSettings,
		ManualNumbers: manualNumbers,
		NumberItems:   numberItems,
		SheetSetting:  sheetSettings,
		CropBleed:     cropBleed,
		PrintSetting:  printSettings,
		Layers:        layers,
	}, nil
}

// ListProjects returns all projects.
func (s *ProjectService) ListProjects() ([]*model.Project, error) {
	return s.projectRepo.GetAll()
}

// GetRecentProjects returns the most recently opened projects.
func (s *ProjectService) GetRecentProjects(limit int) ([]*model.Project, error) {
	if limit <= 0 {
		limit = 10
	}
	return s.projectRepo.GetRecent(limit)
}

// UpdateProject updates project metadata.
func (s *ProjectService) UpdateProject(project *model.Project) error {
	if project.Name == "" {
		return fmt.Errorf("project name is required")
	}
	return s.projectRepo.Update(project)
}

// DeleteProject removes a project and all associated data and files.
func (s *ProjectService) DeleteProject(id string) error {
	// Delete from database (cascading deletes handle related records)
	if err := s.projectRepo.Delete(id); err != nil {
		return err
	}

	// Remove project directory
	projectDir := filepath.Join(s.storagePath, id)
	os.RemoveAll(projectDir) // Best effort cleanup

	return nil
}

// DuplicateProject creates a copy of an existing project.
func (s *ProjectService) DuplicateProject(id string) (*model.Project, error) {
	full, err := s.GetProjectFull(id)
	if err != nil {
		return nil, fmt.Errorf("failed to load source project: %w", err)
	}

	// Create new project with copied name
	newProject, err := s.CreateProject(
		full.Project.Name+" (Copy)",
		full.Project.Type,
		full.Project.Description,
	)
	if err != nil {
		return nil, err
	}

	// Copy number settings
	if full.NumberSetting != nil {
		ns := *full.NumberSetting
		ns.ProjectID = newProject.ID
		ns.ID = ""
		_ = s.numberRepo.UpsertSettings(&ns)
	}

	// Copy manual numbers
	if len(full.ManualNumbers) > 0 {
		copiedNumbers := make([]*model.ManualNumber, len(full.ManualNumbers))
		for i, mn := range full.ManualNumbers {
			copied := *mn
			copied.ID = ""
			copiedNumbers[i] = &copied
		}
		_ = s.numberRepo.SetManualNumbers(newProject.ID, copiedNumbers)
	}

	// Copy sheet settings
	if full.SheetSetting != nil {
		ss := *full.SheetSetting
		ss.ProjectID = newProject.ID
		ss.ID = ""
		_ = s.sheetRepo.Upsert(&ss)
	}

	// Copy crop/bleed settings
	if full.CropBleed != nil {
		cb := *full.CropBleed
		cb.ProjectID = newProject.ID
		cb.ID = ""
		_ = s.cropBleedRepo.Upsert(&cb)
	}

	return newProject, nil
}

// GetProjectDir returns the filesystem directory for a project's assets.
func (s *ProjectService) GetProjectDir(projectID string) string {
	return filepath.Join(s.storagePath, projectID)
}
