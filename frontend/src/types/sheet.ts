// Sheet and layout types matching Go backend models

export interface SheetSettings {
  id: string;
  projectId: string;
  paperSize: string;
  paperWidth: number;
  paperHeight: number;
  orientation: 'portrait' | 'landscape';
  rows: number;
  columns: number;
  hGap: number;
  vGap: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  rotation: number;
}

export interface SheetLayout {
  itemsPerSheet: number;
  totalSheets: number;
  totalItems: number;
  remainingItems: number;
  itemWidth: number;
  itemHeight: number;
  printableWidth: number;
  printableHeight: number;
  positions: ItemPosition[];
}

export interface ItemPosition {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropBleedSettings {
  id: string;
  projectId: string;
  cropMarksEnabled: boolean;
  bleedEnabled: boolean;
  bleedSize: number;
  cropMarkLength: number;
  cropMarkOffset: number;
}

export interface PrintSettings {
  id: string;
  projectId: string;
  printerName: string;
  pageRangeStart: number;
  pageRangeEnd: number;
  copies: number;
  lastPrintedAt: string | null;
}
