/**
 * API Service — wraps Wails Go bindings for desktop runtime,
 * with an in-memory/localStorage fallback when previewing directly in a browser.
 */

import type { Project, ProjectFull, Asset } from '../types';
import type { NumberSettings, ManualNumber, ValidationResult } from '../types';
import type { SheetSettings, SheetLayout, CropBleedSettings } from '../types';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

function isWailsAvailable(): boolean {
  return typeof window !== 'undefined' &&
    'go' in window &&
    // @ts-ignore
    window['go'] &&
    // @ts-ignore
    window['go']['handler'];
}

// Helper to convert PDF file to image Data URL using PDFJS
export async function convertPdfToImageDataUrl(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  // Bundle the worker with Recipta so PDF previews work fully offline and the
  // worker always matches the installed PDF.js version.
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 }); // High DPI scale

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  if (!context) throw new Error('Canvas context not available');

  const renderContext: any = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
  return canvas.toDataURL('image/png');
}

// ─── Browser Fallback Storage ───
const BROWSER_PROJECTS_KEY = 'recipta_browser_projects';

function getBrowserProjects(): Project[] {
  try {
    const raw = localStorage.getItem(BROWSER_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBrowserProjects(projects: Project[]) {
  try {
    localStorage.setItem(BROWSER_PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Failed to save browser projects', e);
  }
}

const PROJECT_HANDLER_PATH = '../../wailsjs/go/handler/ProjectHandler';
const NUMBERING_HANDLER_PATH = '../../wailsjs/go/handler/NumberingHandler';
const SHEET_HANDLER_PATH = '../../wailsjs/go/handler/SheetHandler';
const MAIN_APP_PATH = '../../wailsjs/go/main/App';

// ─── Project API ───

export async function createProject(
  name: string,
  projectType: string,
  description: string = ''
): Promise<Project> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { CreateProject } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    const result = await CreateProject(name, projectType, description);
    return result as unknown as Project;
  }

  // Browser Fallback
  const newProject: Project = {
    id: 'proj_' + Math.random().toString(36).substring(2, 9),
    name,
    description,
    type: projectType as any,
    imagePath: '',
    thumbnailPath: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const projects = getBrowserProjects();
  projects.unshift(newProject);
  saveBrowserProjects(projects);

  return newProject;
}

export async function getProject(id: string): Promise<Project> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetProject } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    const result = await GetProject(id);
    return result as unknown as Project;
  }

  const projects = getBrowserProjects();
  const p = projects.find((x) => x.id === id);
  if (!p) throw new Error(`Project not found: ${id}`);
  return p;
}

export async function getProjectFull(id: string): Promise<ProjectFull> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetProjectFull } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    const result = await GetProjectFull(id);
    return result as unknown as ProjectFull;
  }

  const project = await getProject(id);
  return {
    project,
    assets: [],
    numberSettings: {
      id: 'ns_' + id,
      projectId: id,
      mode: 'auto',
      startNumber: 1,
      endNumber: 100,
      step: 1,
      padding: 4,
      prefix: '',
      suffix: '',
      customSequence: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    manualNumbers: [],
    numberItems: [],
    sheetSettings: {
      id: 'ss_' + id,
      projectId: id,
      paperSize: 'A4',
      paperWidth: 210,
      paperHeight: 297,
      orientation: 'portrait',
      rows: 3,
      columns: 1,
      hGap: 0,
      vGap: 0,
      marginTop: 10,
      marginBottom: 10,
      marginLeft: 10,
      marginRight: 10,
      rotation: 0,
    },
    cropBleedSettings: {
      id: 'cb_' + id,
      projectId: id,
      cropMarksEnabled: false,
      bleedEnabled: false,
      bleedSize: 3,
      cropMarkLength: 5,
      cropMarkOffset: 2,
    },
    printSettings: {
      id: 'ps_' + id,
      projectId: id,
      printerName: '',
      pageRangeStart: 1,
      pageRangeEnd: 0,
      copies: 1,
      lastPrintedAt: null,
    },
    layers: [
      {
        id: 'layer_1',
        projectId: id,
        name: 'Layer 1',
        orderIndex: 0,
        isVisible: true,
        isLocked: false,
        objects: [],
      },
    ],
  };
}

export async function listProjects(): Promise<Project[]> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { ListProjects } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    const result = await ListProjects();
    return (result || []) as unknown as Project[];
  }

  return getBrowserProjects();
}

export async function getRecentProjects(): Promise<Project[]> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetRecentProjects } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    const result = await GetRecentProjects();
    return (result || []) as unknown as Project[];
  }

  return getBrowserProjects().slice(0, 10);
}

export async function updateProject(project: Project): Promise<void> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { UpdateProject } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    return UpdateProject(project as any);
  }

  const projects = getBrowserProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx !== -1) {
    projects[idx] = { ...project, updatedAt: new Date().toISOString() };
    saveBrowserProjects(projects);
  }
}

export async function deleteProject(id: string): Promise<void> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { DeleteProject } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    return DeleteProject(id);
  }

  const projects = getBrowserProjects().filter((p) => p.id !== id);
  saveBrowserProjects(projects);
}

export async function duplicateProject(id: string): Promise<Project> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { DuplicateProject } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    const result = await DuplicateProject(id);
    return result as unknown as Project;
  }

  const project = await getProject(id);
  return createProject(project.name + ' (Copy)', project.type, project.description);
}

export async function importImage(projectId: string): Promise<Asset | null> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { ImportImage } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    const result = await ImportImage(projectId);
    return result as unknown as Asset | null;
  }

  // Browser Fallback — open file picker dialog supporting all images AND PDF
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,.svg,.webp,.png,.jpg,.jpeg,.bmp,.tiff';
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return resolve(null);

      try {
        let dataUrl = '';
        const ext = file.name.split('.').pop()?.toLowerCase() || '';

        if (ext === 'pdf') {
          // Render PDF page to high resolution PNG data URL
          dataUrl = await convertPdfToImageDataUrl(file);
        } else {
          // Standard image file reader
          dataUrl = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(file);
          });
        }

        const asset: Asset = {
          id: 'asset_' + Math.random().toString(36).substring(2, 9),
          projectId,
          originalFilename: file.name,
          storedPath: dataUrl,
          // PDFs are rasterized above, so the stored browser asset is a PNG
          // preview rather than PDF bytes.
          fileType: ext === 'pdf' ? 'png' : (ext || 'png'),
          width: 0,
          height: 0,
          createdAt: new Date().toISOString(),
        };
        resolve(asset);
      } catch (err) {
        console.error('Failed to parse template file:', err);
        resolve(null);
      }
    };
    input.click();
  });
}

export async function saveExportedPdf(fileName: string, pdf: Uint8Array): Promise<string> {
  if (isWailsAvailable()) {
    const { SaveExportedPDF } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < pdf.length; offset += chunkSize) {
      binary += String.fromCharCode(...pdf.subarray(offset, offset + chunkSize));
    }
    return SaveExportedPDF(fileName, btoa(binary));
  }

  const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return anchor.download;
}

export async function getAssetDataUrl(projectId: string, assetId: string): Promise<string> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetAssetDataUrl } = await import(/* @vite-ignore */ PROJECT_HANDLER_PATH);
    return GetAssetDataUrl(projectId, assetId);
  }
  return '';
}

// ─── Numbering API ───

export async function generateNumbers(projectId: string): Promise<string[]> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GenerateNumbers } = await import(/* @vite-ignore */ NUMBERING_HANDLER_PATH);
    const result = await GenerateNumbers(projectId);
    return result || [];
  }

  return Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(4, '0'));
}

export async function validateManualNumbers(numbers: string[]): Promise<ValidationResult> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { ValidateManualNumbers } = await import(/* @vite-ignore */ NUMBERING_HANDLER_PATH);
    const result = await ValidateManualNumbers(numbers);
    return result as unknown as ValidationResult;
  }

  return {
    isValid: true,
    totalItems: numbers.length,
    validItems: numbers.length,
    invalidItems: 0,
    duplicates: [],
    invalidValues: [],
    errors: [],
  };
}

export async function saveNumberSettings(settings: NumberSettings): Promise<void> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { SaveNumberSettings } = await import(/* @vite-ignore */ NUMBERING_HANDLER_PATH);
    return SaveNumberSettings(settings as any);
  }
}

export async function getNumberSettings(projectId: string): Promise<NumberSettings | null> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetNumberSettings } = await import(/* @vite-ignore */ NUMBERING_HANDLER_PATH);
    const result = await GetNumberSettings(projectId);
    return result as unknown as NumberSettings | null;
  }

  return null;
}

export async function saveManualNumbers(projectId: string, numbers: string[]): Promise<void> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { SaveManualNumbers } = await import(/* @vite-ignore */ NUMBERING_HANDLER_PATH);
    return SaveManualNumbers(projectId, numbers);
  }
}

export async function getManualNumbers(projectId: string): Promise<ManualNumber[]> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetManualNumbers } = await import(/* @vite-ignore */ NUMBERING_HANDLER_PATH);
    const result = await GetManualNumbers(projectId);
    return (result || []) as unknown as ManualNumber[];
  }

  return [];
}

// ─── Sheet API ───

export async function calculateSheet(projectId: string, totalItems: number): Promise<SheetLayout> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { CalculateSheet } = await import(/* @vite-ignore */ SHEET_HANDLER_PATH);
    const result = await CalculateSheet(projectId, totalItems);
    return result as unknown as SheetLayout;
  }

  return {
    itemsPerSheet: 3,
    totalSheets: Math.ceil(totalItems / 3),
    totalItems,
    remainingItems: 0,
    itemWidth: 210,
    itemHeight: 90,
    printableWidth: 210,
    printableHeight: 297,
    positions: [],
  };
}

export async function saveSheetSettings(settings: SheetSettings): Promise<void> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { SaveSheetSettings } = await import(/* @vite-ignore */ SHEET_HANDLER_PATH);
    return SaveSheetSettings(settings as any);
  }
}

export async function getSheetSettings(projectId: string): Promise<SheetSettings | null> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetSheetSettings } = await import(/* @vite-ignore */ SHEET_HANDLER_PATH);
    const result = await GetSheetSettings(projectId);
    return result as unknown as SheetSettings | null;
  }

  return null;
}

export async function saveCropBleedSettings(settings: CropBleedSettings): Promise<void> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { SaveCropBleedSettings } = await import(/* @vite-ignore */ SHEET_HANDLER_PATH);
    return SaveCropBleedSettings(settings as any);
  }
}

export async function getCropBleedSettings(projectId: string): Promise<CropBleedSettings | null> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetCropBleedSettings } = await import(/* @vite-ignore */ SHEET_HANDLER_PATH);
    return GetCropBleedSettings(projectId);
  }

  return null;
}

// ─── App API ───

export async function getAppInfo(): Promise<Record<string, string>> {
  if (isWailsAvailable()) {
    // @ts-ignore
    const { GetAppInfo } = await import(/* @vite-ignore */ MAIN_APP_PATH);
    return GetAppInfo();
  }

  return { name: 'Recipta (Browser Mode)', version: '0.1.0' };
}
