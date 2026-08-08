// Numbering types matching Go backend models

export type NumberMode = 'auto' | 'manual';

export interface NumberSettings {
  id: string;
  projectId: string;
  mode: NumberMode;
  startNumber: number;
  endNumber: number;
  step: number;
  padding: number;
  prefix: string;
  suffix: string;
  customSequence: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualNumber {
  id: string;
  projectId: string;
  sequenceOrder: number;
  numberValue: string;
  isValid: boolean;
}

export interface NumberItem {
  id: string;
  projectId: string;
  itemIndex: number;
  numberValue: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fontColor: string;
  letterSpacing: number;
  alignment: string;
  isVisible: boolean;
  isLocked: boolean;
  isOverride: boolean;
  overrideJson: string;
}

export interface ValidationResult {
  isValid: boolean;
  totalItems: number;
  validItems: number;
  invalidItems: number;
  duplicates: string[];
  invalidValues: string[];
  errors: string[];
}
