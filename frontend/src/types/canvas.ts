// Canvas types matching Go backend models

export type ObjectType = 'image' | 'number' | 'text' | 'shape' | 'guide';

export interface CanvasObject {
  id: string;
  projectId: string;
  layerId: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  propertiesJson: string;
}

export interface Layer {
  id: string;
  projectId: string;
  name: string;
  orderIndex: number;
  isVisible: boolean;
  isLocked: boolean;
  objects?: CanvasObject[];
}

export interface Asset {
  id: string;
  projectId: string;
  originalFilename: string;
  storedPath: string;
  fileType: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  type: string;
  configJson: string;
  thumbnailPath: string;
  createdAt: string;
}
