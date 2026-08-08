// Re-export all types for convenient imports
export type { Project, ProjectType, ProjectFull } from './project';
export type { NumberSettings, NumberMode, ManualNumber, NumberItem, ValidationResult } from './numbering';
export type { SheetSettings, SheetLayout, ItemPosition, CropBleedSettings, PrintSettings } from './sheet';
export type { CanvasObject, ObjectType, Layer, Asset, Template } from './canvas';

// Application-level types
export type AppView = 'dashboard' | 'editor';

export type EditorTab = 'receipt' | 'foil';

export interface AppInfo {
  name: string;
  version: string;
}
