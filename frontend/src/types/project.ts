// TypeScript types matching Go backend models

import type { Asset } from './canvas';
import type { NumberSettings, ManualNumber, NumberItem } from './numbering';
import type { SheetSettings, CropBleedSettings, PrintSettings } from './sheet';
import type { Layer } from './canvas';

export type ProjectType = 'receipt' | 'foil';

export interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  imagePath: string;
  thumbnailPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFull {
  project: Project;
  assets: Asset[];
  numberSettings: NumberSettings | null;
  manualNumbers: ManualNumber[];
  numberItems: NumberItem[];
  sheetSettings: SheetSettings | null;
  cropBleedSettings: CropBleedSettings | null;
  printSettings: PrintSettings | null;
  layers: Layer[];
}
