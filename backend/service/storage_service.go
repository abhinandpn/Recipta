package service

import (
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/abhinandpn/Recipta/backend/model"
	"github.com/abhinandpn/Recipta/backend/repository"
	"github.com/google/uuid"
)

// StorageService handles file system operations for project assets.
type StorageService struct {
	assetRepo   *repository.AssetRepo
	storagePath string
}

// NewStorageService creates a new StorageService.
func NewStorageService(assetRepo *repository.AssetRepo, storagePath string) *StorageService {
	return &StorageService{
		assetRepo:   assetRepo,
		storagePath: storagePath,
	}
}

// ImportImage copies an image or PDF file into the project's asset directory and records it in the database.
func (s *StorageService) ImportImage(projectID, sourcePath string) (*model.Asset, error) {
	// Validate source file exists
	info, err := os.Stat(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("source file not found: %w", err)
	}
	if info.IsDir() {
		return nil, fmt.Errorf("source path is a directory, not a file")
	}

	// Determine file type (supports images AND PDF documents)
	ext := strings.ToLower(filepath.Ext(sourcePath))
	validExts := map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true,
		".bmp": true, ".gif": true, ".tiff": true,
		".tif": true, ".webp": true, ".svg": true,
		".pdf": true,
	}
	if !validExts[ext] {
		return nil, fmt.Errorf("unsupported file type: %s", ext)
	}

	// Create asset directory
	assetDir := filepath.Join(s.storagePath, projectID, "assets")
	if err := os.MkdirAll(assetDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create asset directory: %w", err)
	}

	// Generate unique filename to prevent collisions
	assetID := uuid.New().String()
	originalFilename := filepath.Base(sourcePath)
	storedFilename := assetID + ext
	storedPath := filepath.Join(assetDir, storedFilename)

	// Copy file
	if err := copyFile(sourcePath, storedPath); err != nil {
		return nil, fmt.Errorf("failed to copy image: %w", err)
	}

	// Create asset record
	asset := &model.Asset{
		ID:               assetID,
		ProjectID:        projectID,
		OriginalFilename: originalFilename,
		StoredPath:       storedPath,
		FileType:         strings.TrimPrefix(ext, "."),
	}

	if err := s.assetRepo.Create(asset); err != nil {
		os.Remove(storedPath) // Cleanup on failure
		return nil, err
	}

	return asset, nil
}

// GetAssetDataUrl reads the stored asset file and returns it as a Base64 data URL.
func (s *StorageService) GetAssetDataUrl(assetID string, projectID string) (string, error) {
	assets, err := s.assetRepo.GetByProjectID(projectID)
	if err != nil {
		return "", err
	}

	var targetAsset *model.Asset
	for _, a := range assets {
		if a.ID == assetID {
			targetAsset = a
			break
		}
	}

	if targetAsset == nil {
		return "", fmt.Errorf("asset not found: %s", assetID)
	}

	// Read file bytes
	data, err := os.ReadFile(targetAsset.StoredPath)
	if err != nil {
		return "", fmt.Errorf("failed to read asset file: %w", err)
	}

	// Determine mime type
	mimeType := "image/png"
	switch strings.ToLower(targetAsset.FileType) {
	case "pdf":
		mimeType = "application/pdf"
	case "jpg", "jpeg":
		mimeType = "image/jpeg"
	case "webp":
		mimeType = "image/webp"
	case "svg":
		mimeType = "image/svg+xml"
	case "bmp":
		mimeType = "image/bmp"
	case "gif":
		mimeType = "image/gif"
	}

	base64Data := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, base64Data), nil
}

// GetProjectAssets retrieves all assets for a project.
func (s *StorageService) GetProjectAssets(projectID string) ([]*model.Asset, error) {
	return s.assetRepo.GetByProjectID(projectID)
}

// DeleteAsset removes an asset file and its database record.
func (s *StorageService) DeleteAsset(assetID string) error {
	return s.assetRepo.Delete(assetID)
}

// copyFile copies a file from src to dst.
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}
