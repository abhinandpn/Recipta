package main

import (
	"context"
	"fmt"
	"log"

	"github.com/abhinandpn/Recipta/backend/database"
	"github.com/abhinandpn/Recipta/backend/handler"
	"github.com/abhinandpn/Recipta/backend/repository"
	"github.com/abhinandpn/Recipta/backend/service"
)

// App struct holds the application's core dependencies and handlers.
type App struct {
	ctx context.Context
	db  *database.Database

	// Handlers (exposed to frontend via Wails bindings)
	// Initialized as empty structs in NewApp() so Wails can reflect on them.
	// Their internal services are wired during startup().
	ProjectHandler  *handler.ProjectHandler
	NumberingHandler *handler.NumberingHandler
	SheetHandler    *handler.SheetHandler
}

// NewApp creates a new App application struct.
// Handlers are pre-allocated so Wails can bind them before startup() runs.
func NewApp() *App {
	return &App{
		ProjectHandler:  &handler.ProjectHandler{},
		NumberingHandler: &handler.NumberingHandler{},
		SheetHandler:    &handler.SheetHandler{},
	}
}

// startup is called when the app starts. Initializes the database and wires all services.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize database
	dbPath, err := database.GetDefaultDBPath()
	if err != nil {
		log.Fatalf("Failed to get database path: %v", err)
	}

	db, err := database.New(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	a.db = db

	// Run migrations
	if err := database.RunMigrations(db.DB); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Get storage path
	storagePath, err := database.GetProjectStoragePath()
	if err != nil {
		log.Fatalf("Failed to get storage path: %v", err)
	}

	// Initialize repositories
	projectRepo := repository.NewProjectRepo(db.DB)
	assetRepo := repository.NewAssetRepo(db.DB)
	numberRepo := repository.NewNumberRepo(db.DB)
	sheetRepo := repository.NewSheetRepo(db.DB)
	cropBleedRepo := repository.NewCropBleedRepo(db.DB)
	printRepo := repository.NewPrintRepo(db.DB)
	layerRepo := repository.NewLayerRepo(db.DB)

	// Initialize services
	projectService := service.NewProjectService(
		projectRepo, assetRepo, numberRepo, sheetRepo,
		cropBleedRepo, printRepo, layerRepo, storagePath,
	)
	numberingService := service.NewNumberingService(numberRepo)
	sheetService := service.NewSheetService(sheetRepo, cropBleedRepo)
	storageService := service.NewStorageService(assetRepo, storagePath)

	// Wire services into pre-allocated handlers
	a.ProjectHandler.Init(ctx, projectService, storageService)
	a.NumberingHandler.Init(numberingService)
	a.SheetHandler.Init(sheetService)

	fmt.Println("✓ Recipta initialized successfully")
	fmt.Printf("  Database: %s\n", dbPath)
	fmt.Printf("  Storage:  %s\n", storagePath)
}

// shutdown is called when the app is closing.
func (a *App) shutdown(ctx context.Context) {
	if a.db != nil {
		a.db.Close()
		fmt.Println("✓ Database connection closed")
	}
}

// GetAppInfo returns basic app information for the frontend.
func (a *App) GetAppInfo() map[string]string {
	return map[string]string{
		"name":    "Recipta",
		"version": "0.1.0",
	}
}
