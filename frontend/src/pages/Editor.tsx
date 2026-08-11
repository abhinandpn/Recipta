import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/appStore';
import { NumberingPanel } from '../components/panels/NumberingPanel';
import * as api from '../services/api';
import { generateNumberedPdf } from '../services/pdfExport';
import { createNumberLayoutPlan } from '../services/numberLayout';
import { toggleAppFullscreen } from '../services/fullscreen';
import type { Asset, NumberSettings, NumberItem } from '../types';
import '../styles/components/editor.css';

interface LayerGroup {
  id: string;
  name: string;
  itemIds: string[];
}

interface PatternDefinition {
  id: string;
  name: string;
  color: string;
}

interface EditorHistorySnapshot {
  numberItems: NumberItem[];
  layerGroups: LayerGroup[];
  patternGroups: Record<string, string>;
  patternDefinitions: PatternDefinition[];
  numberArrangement: 'across-sheet' | 'cut-stack' | 'same-number' | 'custom-pattern' | 'linked-cut-stack' | 'linked-across-sheet';
}

interface WorkspaceLayout {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  locked: boolean;
}

const PATTERN_COLORS = ['#62a7d2', '#d18a5b', '#79ad78', '#b285c5', '#c7ae61', '#cf7474', '#6fb8ad', '#9b9bd0'];
const assetPreviewCache = new Map<string, string>();
const WORKSPACE_LAYOUT_KEY = 'recipta-workspace-layout-v1';
const LINK_SUMMARY_KEY = 'recipta-link-summary-visible';
const CANVAS_RULER_SIZE = 20;
const ASSET_PREVIEW_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function loadWorkspaceLayout(): WorkspaceLayout {
  const fallback: WorkspaceLayout = { leftWidth: 365, rightWidth: 430, leftCollapsed: false, rightCollapsed: false, locked: false };
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_KEY) || '{}') as Partial<WorkspaceLayout>;
    return {
      leftWidth: typeof saved.leftWidth === 'number' ? Math.min(480, Math.max(240, saved.leftWidth)) : fallback.leftWidth,
      rightWidth: typeof saved.rightWidth === 'number' ? Math.min(480, Math.max(240, saved.rightWidth)) : fallback.rightWidth,
      leftCollapsed: typeof saved.leftCollapsed === 'boolean' ? saved.leftCollapsed : fallback.leftCollapsed,
      rightCollapsed: typeof saved.rightCollapsed === 'boolean' ? saved.rightCollapsed : fallback.rightCollapsed,
      locked: typeof saved.locked === 'boolean' ? saved.locked : fallback.locked,
    };
  } catch {
    return fallback;
  }
}

function getNumberBoxCenter(item: NumberItem) {
  const angle = ((item.rotation || 0) * Math.PI) / 180;
  const halfWidth = item.width / 2;
  const halfHeight = item.height / 2;
  return {
    x: item.x + Math.cos(angle) * halfWidth - Math.sin(angle) * halfHeight,
    y: item.y + Math.sin(angle) * halfWidth + Math.cos(angle) * halfHeight,
  };
}

// Finds the intersection between a center-to-center connection and the
// rotated number box. This keeps connectors on the box border and out of text.
function getNumberBoxEdgeAnchor(item: NumberItem, target: { x: number; y: number }) {
  const center = getNumberBoxCenter(item);
  const angle = ((item.rotation || 0) * Math.PI) / 180;
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const localX = Math.cos(angle) * dx + Math.sin(angle) * dy;
  const localY = -Math.sin(angle) * dx + Math.cos(angle) * dy;
  if (Math.abs(localX) < 0.001 && Math.abs(localY) < 0.001) return center;
  const scaleX = Math.abs(localX) > 0.001 ? (item.width / 2) / Math.abs(localX) : Number.POSITIVE_INFINITY;
  const scaleY = Math.abs(localY) > 0.001 ? (item.height / 2) / Math.abs(localY) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  const edgeX = localX * scale;
  const edgeY = localY * scale;
  return {
    x: center.x + Math.cos(angle) * edgeX - Math.sin(angle) * edgeY,
    y: center.y + Math.sin(angle) * edgeX + Math.cos(angle) * edgeY,
  };
}

export function Editor() {
  const { activeProject, activeProjectFull, setError, setIsLoading } = useAppStore();

  const [currentAsset, setCurrentAsset] = useState<Asset | null>(
    activeProjectFull?.assets?.[0] || null
  );

  const [numberSettings, setNumberSettings] = useState<NumberSettings | null>(
    activeProjectFull?.numberSettings
      ? { ...activeProjectFull.numberSettings, mode: 'auto' }
      : null
  );

  // Multiple number overlay positions list
  const defaultItems: NumberItem[] = activeProjectFull?.numberItems?.length
    ? activeProjectFull.numberItems
    : [
        {
          id: 'ni_1',
          projectId: activeProject?.id || '',
          itemIndex: 0,
          numberValue: '0001',
          x: 68,
          y: 84,
          width: 140,
          height: 30,
          rotation: 270,
          fontFamily: 'Inter',
          fontSize: 16,
          fontStyle: 'bold',
          fontColor: '#111827',
          letterSpacing: 0,
          alignment: 'left',
          isVisible: true,
          isLocked: false,
          isOverride: false,
          overrideJson: '{}',
        },
      ];

  const [numberItems, setNumberItems] = useState<NumberItem[]>(defaultItems);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(defaultItems[0]?.id ? [defaultItems[0].id] : []);
  const [layerGroups, setLayerGroups] = useState<LayerGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [exportFileName, setExportFileName] = useState(`${activeProject?.name || 'recipta'}-numbered.pdf`);
  const [exportPaperSize, setExportPaperSize] = useState<'A4' | 'A3' | 'source'>('A4');
  const [exportOrientation, setExportOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [exportQuality, setExportQuality] = useState(85);
  const [exportContent, setExportContent] = useState<'design-numbers' | 'numbers-only'>('design-numbers');
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [flowDirection, setFlowDirection] = useState<'top-bottom' | 'bottom-top' | 'left-right' | 'right-left' | 'custom'>('top-bottom');
  const [showNumberFlow, setShowNumberFlow] = useState(false);
  const [showConnectionEditor, setShowConnectionEditor] = useState(false);
  const [showLinkSummary, setShowLinkSummary] = useState(() => localStorage.getItem(LINK_SUMMARY_KEY) === 'true');
  const [showAdvancedFlow, setShowAdvancedFlow] = useState(false);
  const [numberFlowTarget, setNumberFlowTarget] = useState<HTMLDivElement | null>(null);
  const [numberPositionsTarget, setNumberPositionsTarget] = useState<HTMLDivElement | null>(null);
  const [previewSheet, setPreviewSheet] = useState(0);
  const showSheetPreview = true;
  const [numberArrangement, setNumberArrangement] = useState<'across-sheet' | 'cut-stack' | 'same-number' | 'custom-pattern' | 'linked-cut-stack' | 'linked-across-sheet'>('cut-stack');
  const [patternGroups, setPatternGroups] = useState<Record<string, string>>(() => Object.fromEntries(defaultItems.map((item, index) => [item.id, String(index + 1)])));
  const [patternDefinitions, setPatternDefinitions] = useState<PatternDefinition[]>(() => defaultItems.map((_, index) => ({ id: String(index + 1), name: `Pattern ${String.fromCharCode(65 + index)}`, color: PATTERN_COLORS[index % PATTERN_COLORS.length] })));
  const [selectedConnection, setSelectedConnection] = useState<{ groupId: string; fromId: string; toId: string } | null>(null);
  const [selectedPatternPositionIds, setSelectedPatternPositionIds] = useState<string[]>([]);
  const [reversedConnections, setReversedConnections] = useState<Record<string, boolean>>({});
  const [connectionDrag, setConnectionDrag] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const connectionDragFrame = useRef<number | null>(null);
  const pendingConnectionPoint = useRef<{ x: number; y: number } | null>(null);
  const numberDragFrame = useRef<number | null>(null);
  const pendingNumberDragPoint = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<EditorHistorySnapshot[]>([]);
  const redoStack = useRef<EditorHistorySnapshot[]>([]);
  const shortcutHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const gridMenuRef = useRef<HTMLDivElement>(null);
  const settingsSaveTimer = useRef<number | null>(null);
  const assetLoadRequestId = useRef(0);

  // Grid, snapping, and preview controls are editor-only aids.
  const [showGrid, setShowGrid] = useState(false);
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridX, setGridX] = useState(20);
  const [gridY, setGridY] = useState(20);
  const [gridOpacity, setGridOpacity] = useState(35);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [panMode, setPanMode] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [verticalGuides, setVerticalGuides] = useState<number[]>([]);
  const [horizontalGuides, setHorizontalGuides] = useState<number[]>([]);
  const [draggingGuide, setDraggingGuide] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);
  const initialWorkspaceLayout = useRef<WorkspaceLayout>(loadWorkspaceLayout());
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(initialWorkspaceLayout.current.leftWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(initialWorkspaceLayout.current.rightWidth);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(initialWorkspaceLayout.current.leftCollapsed);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(initialWorkspaceLayout.current.rightCollapsed);
  const [workspaceLocked, setWorkspaceLocked] = useState<boolean>(initialWorkspaceLayout.current.locked);
  const [panelsHidden, setPanelsHidden] = useState(false);

  // Dragging state for active selected number overlay
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });
  const groupDragStart = useRef<Record<string, { x: number; y: number }>>({});
  const pendingDragPositions = useRef<Record<string, { x: number; y: number }>>({});
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const canvasZoomStageRef = useRef<HTMLDivElement>(null);
  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const panFrame = useRef<number | null>(null);
  const pendingPanPoint = useRef<{ x: number; y: number } | null>(null);

  // Loaded canvas template image/PNG preview source URL
  const [canvasSrc, setCanvasSrc] = useState<string>('');
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [rulerOrigin, setRulerOrigin] = useState({ x: 20, y: 20 });

  const createHistorySnapshot = (): EditorHistorySnapshot => ({
    numberItems: numberItems.map((item) => ({ ...item })),
    layerGroups: layerGroups.map((group) => ({ ...group, itemIds: [...group.itemIds] })),
    patternGroups: { ...patternGroups },
    patternDefinitions: patternDefinitions.map((definition) => ({ ...definition })),
    numberArrangement,
  });

  const restoreHistorySnapshot = (snapshot: EditorHistorySnapshot) => {
    setNumberItems(snapshot.numberItems.map((item) => ({ ...item })));
    setLayerGroups(snapshot.layerGroups.map((group) => ({ ...group, itemIds: [...group.itemIds] })));
    setPatternGroups({ ...snapshot.patternGroups });
    setPatternDefinitions(snapshot.patternDefinitions.map((definition) => ({ ...definition })));
    setNumberArrangement(snapshot.numberArrangement);
    setSelectedIndex((index) => Math.min(index, Math.max(0, snapshot.numberItems.length - 1)));
    setSelectedLayerIds([]);
    setSelectedPatternPositionIds([]);
    setSelectedConnection(null);
    setConnectionDrag(null);
  };

  const captureUndoState = () => {
    const snapshot = createHistorySnapshot();
    const latest = undoStack.current[undoStack.current.length - 1];
    if (latest && JSON.stringify(latest) === JSON.stringify(snapshot)) return;
    undoStack.current.push(snapshot);
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
  };

  const undoEditorChange = () => {
    const current = createHistorySnapshot();
    let previous = undoStack.current.pop();
    while (previous && JSON.stringify(previous) === JSON.stringify(current)) previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(current);
    restoreHistorySnapshot(previous);
  };

  const redoEditorChange = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(createHistorySnapshot());
    restoreHistorySnapshot(next);
  };

  // Install keyboard listeners exactly once. The ref is updated with the
  // latest editor state below, avoiding listener churn during dragging.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => shortcutHandlerRef.current(event);
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  React.useEffect(() => {
    const openShortcuts = () => setShowShortcutsDialog(true);
    const resetLayout = () => resetWorkspaceLayout();
    const toggleGridMenu = () => setShowGridMenu((open) => !open);
    window.addEventListener('recipta:show-shortcuts', openShortcuts);
    window.addEventListener('recipta:reset-layout', resetLayout);
    window.addEventListener('recipta:toggle-grid-menu', toggleGridMenu);
    return () => {
      window.removeEventListener('recipta:show-shortcuts', openShortcuts);
      window.removeEventListener('recipta:reset-layout', resetLayout);
      window.removeEventListener('recipta:toggle-grid-menu', toggleGridMenu);
    };
  }, []);

  React.useEffect(() => {
    localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify({
      leftWidth: leftPanelWidth,
      rightWidth: rightPanelWidth,
      leftCollapsed: leftPanelCollapsed,
      rightCollapsed: rightPanelCollapsed,
      locked: workspaceLocked,
    }));
  }, [leftPanelWidth, rightPanelWidth, leftPanelCollapsed, rightPanelCollapsed, workspaceLocked]);

  React.useEffect(() => {
    localStorage.setItem(LINK_SUMMARY_KEY, String(showLinkSummary));
  }, [showLinkSummary]);

  React.useEffect(() => {
    const requestId = ++assetLoadRequestId.current;
    async function loadAssetSource() {
      if (!activeProject || !currentAsset) {
        setCanvasSrc('');
        setCanvasSize(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setCanvasSize(null);
        const cacheKey = `${activeProject.id}:${currentAsset.id}:${currentAsset.storedPath}`;
        const cachedPreview = assetPreviewCache.get(cacheKey);
        if (cachedPreview) {
          if (assetLoadRequestId.current === requestId) setCanvasSrc(cachedPreview);
          return;
        }
        // Browser imports are already data URLs; desktop imports are loaded
        // securely from the Go backend.
        const dataUrl = currentAsset.storedPath.startsWith('data:')
          ? currentAsset.storedPath
          : await withTimeout(
            api.getAssetDataUrl(activeProject.id, currentAsset.id),
            ASSET_PREVIEW_TIMEOUT_MS,
            'The design took too long to load. Please try changing the image again.',
          );
        // Use the actual payload MIME type when available. Older browser-mode
        // imports can be labelled "pdf" even though they already contain the
        // rasterized PNG preview.
        const isPdfData = dataUrl.startsWith('data:application/pdf');
        const isImageData = dataUrl.startsWith('data:image/');
        const needsPdfRasterization = isPdfData || (
          currentAsset.fileType.toLowerCase() === 'pdf' && !isImageData
        );

        if (needsPdfRasterization) {
          // Rasterize PDF Page 1 to high-resolution PNG URL
          const response = await withTimeout(fetch(dataUrl), ASSET_PREVIEW_TIMEOUT_MS, 'The PDF preview request timed out.');
          if (!response.ok) {
            throw new Error(`Unable to read PDF (${response.status})`);
          }
          const blob = await response.blob();
          const file = new File([blob], currentAsset.originalFilename, { type: 'application/pdf' });
          const rasterizedUrl = await withTimeout(
            api.convertPdfToImageDataUrl(file),
            ASSET_PREVIEW_TIMEOUT_MS,
            'PDF rendering timed out. Try importing a smaller or repaired PDF.',
          );
          assetPreviewCache.set(cacheKey, rasterizedUrl);
          if (assetLoadRequestId.current === requestId) setCanvasSrc(rasterizedUrl);
        } else {
          assetPreviewCache.set(cacheKey, dataUrl);
          if (assetLoadRequestId.current === requestId) setCanvasSrc(dataUrl);
        }
      } catch (err) {
        if (assetLoadRequestId.current !== requestId) return;
        console.error('Failed to load asset preview:', err);
        setCanvasSrc('');
        setError(`Failed to render ${currentAsset.fileType.toUpperCase()} preview: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (assetLoadRequestId.current === requestId) setIsLoading(false);
      }
    }
    loadAssetSource();
    return () => { if (assetLoadRequestId.current === requestId) assetLoadRequestId.current += 1; };
  }, [currentAsset, activeProject]);

  React.useLayoutEffect(() => {
    const area = canvasAreaRef.current;
    const documentCanvas = canvasContainerRef.current;
    if (!area || !documentCanvas) return;
    const updateRulerOrigin = () => {
      const areaRect = area.getBoundingClientRect();
      const documentRect = documentCanvas.getBoundingClientRect();
      const nextOrigin = {
        x: documentRect.left - areaRect.left + area.scrollLeft,
        y: documentRect.top - areaRect.top + area.scrollTop,
      };
      setRulerOrigin((origin) => Math.abs(origin.x - nextOrigin.x) < 0.5 && Math.abs(origin.y - nextOrigin.y) < 0.5 ? origin : nextOrigin);
    };
    const frame = requestAnimationFrame(updateRulerOrigin);
    const resizeObserver = new ResizeObserver(updateRulerOrigin);
    resizeObserver.observe(area);
    resizeObserver.observe(documentCanvas);
    area.addEventListener('scroll', updateRulerOrigin, { passive: true });
    window.addEventListener('resize', updateRulerOrigin);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      area.removeEventListener('scroll', updateRulerOrigin);
      window.removeEventListener('resize', updateRulerOrigin);
    };
  }, [canvasSize, previewZoom, canvasSrc, panelsHidden, leftPanelWidth, rightPanelWidth, leftPanelCollapsed, rightPanelCollapsed]);

  React.useLayoutEffect(() => {
    const area = canvasAreaRef.current;
    const documentCanvas = canvasContainerRef.current;
    if (!area || !documentCanvas) return;
    const frame = requestAnimationFrame(() => {
      const areaRect = area.getBoundingClientRect();
      const documentRect = documentCanvas.getBoundingClientRect();
      const nextOrigin = {
        x: documentRect.left - areaRect.left + area.scrollLeft,
        y: documentRect.top - areaRect.top + area.scrollTop,
      };
      setRulerOrigin((origin) => Math.abs(origin.x - nextOrigin.x) < 0.5 && Math.abs(origin.y - nextOrigin.y) < 0.5 ? origin : nextOrigin);
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasPan.x, canvasPan.y]);

  React.useEffect(() => () => {
    if (connectionDragFrame.current !== null) cancelAnimationFrame(connectionDragFrame.current);
    if (numberDragFrame.current !== null) cancelAnimationFrame(numberDragFrame.current);
    if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
    if (settingsSaveTimer.current !== null) window.clearTimeout(settingsSaveTimer.current);
  }, []);

  React.useEffect(() => {
    if (!showGridMenu) return;
    const closeMenu = (event: MouseEvent) => {
      if (!gridMenuRef.current?.contains(event.target as Node)) setShowGridMenu(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [showGridMenu]);

  if (!activeProject) {
    return (
      <div className="editor">
        <div className="editor-canvas-area">
          <div className="editor-canvas-placeholder">
            <span className="editor-canvas-placeholder-icon">📋</span>
            <span className="editor-canvas-placeholder-text">
              No project selected. Go to the Dashboard to create or open a project.
            </span>
          </div>
        </div>
      </div>
    );
  }

  const handleImportImage = async () => {
    if (!activeProject) return;
    try {
      setIsLoading(true);
      const asset = await api.importImage(activeProject.id);
      if (asset) {
        setCurrentAsset(asset);
        setCanvasPan({ x: 0, y: 0 });
        await api.updateProject({
          ...activeProject,
          imagePath: asset.storedPath,
        });
      }
    } catch (err) {
      console.error('Failed to import image:', err);
      setError(`Failed to import image: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Dragging handlers for canvas number box
  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    if (panMode || spacePressed || e.button === 1) return;
    e.stopPropagation();
    if (e.altKey) {
      duplicateNumberPosition(index, { x: e.clientX, y: e.clientY });
      return;
    }
    captureUndoState();
    setSelectedIndex(index);
    setDraggingIdx(index);
    const item = numberItems[index];
    const activeGroup = layerGroups.find((group) => group.id === activeGroupId && group.itemIds.includes(item.id));
    if (!activeGroup) {
      setActiveGroupId(null);
      setSelectedLayerIds([item.id]);
    }
    groupDragStart.current = Object.fromEntries(
      numberItems
        .filter((candidate) => activeGroup?.itemIds.includes(candidate.id))
        .map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }])
    );
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: item.x,
      initialY: item.y,
    };
    pendingDragPositions.current = {};
  };

  const updateDraggedNumber = (clientX: number, clientY: number) => {
    if (draggingIdx === null) return;
    const zoomScale = previewZoom / 100;
    const dx = (clientX - dragStart.current.x) / zoomScale;
    const dy = (clientY - dragStart.current.y) / zoomScale;
    let newX = Math.max(0, dragStart.current.initialX + dx);
    let newY = Math.max(0, dragStart.current.initialY + dy);
    if (snapToGrid) {
      newX = Math.round(newX / gridX) * gridX;
      newY = Math.round(newY / gridY) * gridY;
    }
    const draggedItem = numberItems[draggingIdx];
    if (!draggedItem) return;
    const activeGroup = layerGroups.find((group) => group.id === activeGroupId && group.itemIds.includes(draggedItem.id));
    const positions: Record<string, { x: number; y: number }> = {};
    if (!activeGroup) {
      positions[draggedItem.id] = { x: newX, y: newY };
    } else {
      const groupDx = newX - dragStart.current.initialX;
      const groupDy = newY - dragStart.current.initialY;
      Object.entries(groupDragStart.current).forEach(([itemId, start]) => {
        positions[itemId] = { x: Math.max(0, start.x + groupDx), y: Math.max(0, start.y + groupDy) };
      });
    }
    pendingDragPositions.current = positions;
    Object.entries(positions).forEach(([itemId, position]) => {
      const element = canvasContainerRef.current?.querySelector<HTMLElement>(`[data-number-item-id="${CSS.escape(itemId)}"]`);
      if (element) {
        element.style.left = `${position.x}px`;
        element.style.top = `${position.y}px`;
      }
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (connectionDrag && canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const zoomScale = previewZoom / 100;
      pendingConnectionPoint.current = { x: (e.clientX - rect.left) / zoomScale, y: (e.clientY - rect.top) / zoomScale };
      if (connectionDragFrame.current === null) {
        connectionDragFrame.current = requestAnimationFrame(() => {
          const point = pendingConnectionPoint.current;
          if (point) setConnectionDrag((drag) => drag ? { ...drag, ...point } : null);
          connectionDragFrame.current = null;
        });
      }
      return;
    }
    if (isPanning && canvasAreaRef.current) {
      pendingPanPoint.current = { x: e.clientX, y: e.clientY };
      if (panFrame.current === null) {
        panFrame.current = requestAnimationFrame(() => {
          const point = pendingPanPoint.current;
          if (point && canvasZoomStageRef.current) {
            const x = panStart.current.offsetX + point.x - panStart.current.x;
            const y = panStart.current.offsetY + point.y - panStart.current.y;
            canvasZoomStageRef.current.style.transform = `translate(${x}px, ${y}px)`;
          }
          panFrame.current = null;
        });
      }
      return;
    }
    if (draggingGuide && canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const zoomScale = previewZoom / 100;
      if (draggingGuide.axis === 'x') {
        const position = (e.clientX - rect.left) / zoomScale;
        setVerticalGuides((guides) => guides.map((guide, index) => index === draggingGuide.index ? position : guide));
      } else {
        const position = (e.clientY - rect.top) / zoomScale;
        setHorizontalGuides((guides) => guides.map((guide, index) => index === draggingGuide.index ? position : guide));
      }
      return;
    }
    if (draggingIdx === null) return;
    pendingNumberDragPoint.current = { x: e.clientX, y: e.clientY };
    if (numberDragFrame.current === null) {
      numberDragFrame.current = requestAnimationFrame(() => {
        const point = pendingNumberDragPoint.current;
        if (point) updateDraggedNumber(point.x, point.y);
        numberDragFrame.current = null;
      });
    }
  };

  const handleMouseUp = (event: React.MouseEvent) => {
    if (connectionDrag) {
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const targetBox = element?.closest<HTMLElement>('[data-number-item-id]');
      const targetId = targetBox?.dataset.numberItemId;
      if (targetId && targetId !== connectionDrag.fromId) connectNumberPositions(connectionDrag.fromId, targetId);
      setConnectionDrag(null);
      pendingConnectionPoint.current = null;
      if (connectionDragFrame.current !== null) cancelAnimationFrame(connectionDragFrame.current);
      connectionDragFrame.current = null;
    }
    if (draggingIdx !== null) {
      if (numberDragFrame.current !== null) cancelAnimationFrame(numberDragFrame.current);
      numberDragFrame.current = null;
      pendingNumberDragPoint.current = null;
      updateDraggedNumber(event.clientX, event.clientY);
      const committedPositions = pendingDragPositions.current;
      if (Object.keys(committedPositions).length) {
        setNumberItems((items) => items.map((item) => committedPositions[item.id] ? { ...item, ...committedPositions[item.id] } : item));
      }
      pendingDragPositions.current = {};
    }
    setDraggingIdx(null);
    if (draggingGuide) {
      if (draggingGuide.axis === 'x') {
        setVerticalGuides((guides) => guides.filter((position) => position >= 0 && (!canvasSize || position <= canvasSize.width)));
      } else {
        setHorizontalGuides((guides) => guides.filter((position) => position >= 0 && (!canvasSize || position <= canvasSize.height)));
      }
    }
    setDraggingGuide(null);
    if (isPanning) {
      if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
      panFrame.current = null;
      pendingPanPoint.current = null;
      setCanvasPan({ x: panStart.current.offsetX + event.clientX - panStart.current.x, y: panStart.current.offsetY + event.clientY - panStart.current.y });
    }
    setIsPanning(false);
  };

  const startGuideFromRuler = (event: React.MouseEvent, axis: 'x' | 'y') => {
    if (!canvasSrc || !canvasContainerRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggingIdx(null);
    if (axis === 'x') {
      const index = verticalGuides.length;
      setVerticalGuides((guides) => [...guides, 0]);
      setDraggingGuide({ axis, index });
    } else {
      const index = horizontalGuides.length;
      setHorizontalGuides((guides) => [...guides, 0]);
      setDraggingGuide({ axis, index });
    }
  };

  const handlePanStart = (e: React.MouseEvent<HTMLDivElement>) => {
    const canPan = panMode || spacePressed || e.button === 1;
    if (!canPan || !canvasAreaRef.current) return;
    e.preventDefault();
    setDraggingIdx(null);
    setDraggingGuide(null);
    setIsPanning(true);
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: canvasPan.x,
      offsetY: canvasPan.y,
    };
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!canvasAreaRef.current || !e.shiftKey) return;
    e.preventDefault();
    canvasAreaRef.current.scrollLeft += e.deltaY;
  };

  // Add a new Number position to the canvas
  const handleAddNumberItem = () => {
    captureUndoState();
    const nextIdx = numberItems.length;
    const newItem: NumberItem = {
      id: `ni_${Date.now()}_${nextIdx}`,
      projectId: activeProject.id,
      itemIndex: nextIdx,
      numberValue: getSampleNumberValue(),
      x: 250 + nextIdx * 20,
      y: 120 + nextIdx * 20,
      width: 140,
      height: 30,
      rotation: 0,
      fontFamily: 'Inter',
      fontSize: 16,
      fontStyle: 'bold',
      fontColor: '#111827',
      letterSpacing: 0,
      alignment: 'left',
      isVisible: true,
      isLocked: false,
      isOverride: false,
      overrideJson: '{}',
    };
    setNumberItems((prev) => [...prev, newItem]);
    setPatternGroups((groups) => ({ ...groups, [newItem.id]: String(nextIdx + 1) }));
    setPatternDefinitions((definitions) => definitions.some((definition) => definition.id === String(nextIdx + 1)) ? definitions : [...definitions, { id: String(nextIdx + 1), name: `Pattern ${String.fromCharCode(65 + nextIdx)}`, color: PATTERN_COLORS[nextIdx % PATTERN_COLORS.length] }]);
    setSelectedIndex(nextIdx);
    setSelectedLayerIds([newItem.id]);
    setActiveGroupId(null);
  };

  const setReceiptsPerSheet = (requestedCount: number) => {
    const targetCount = Math.max(1, Math.min(100, Math.round(requestedCount)));
    const itemGroupKeys = numberItems.map((item, index) => patternGroups[item.id] || String(index + 1));
    const currentGroupKeys = [...new Set(itemGroupKeys)];
    if (targetCount === currentGroupKeys.length) return;
    captureUndoState();

    if (targetCount < currentGroupKeys.length) {
      const retainedGroupKeys = new Set(currentGroupKeys.slice(0, targetCount));
      const retained = numberItems.filter((item, index) => retainedGroupKeys.has(itemGroupKeys[index])).map((item, index) => ({ ...item, itemIndex: index }));
      const retainedIds = new Set(retained.map((item) => item.id));
      setNumberItems(retained);
      setSelectedIndex((index) => Math.min(index, retained.length - 1));
      setSelectedLayerIds((ids) => ids.filter((id) => retainedIds.has(id)));
      setLayerGroups((groups) => groups
        .map((group) => ({ ...group, itemIds: group.itemIds.filter((id) => retainedIds.has(id)) }))
        .filter((group) => group.itemIds.length > 1));
      setPatternGroups((groups) => Object.fromEntries(Object.entries(groups).filter(([id]) => retainedIds.has(id))));
      setPatternDefinitions((definitions) => definitions.slice(0, Math.max(1, retained.length)));
      setPreviewSheet(0);
      return;
    }

    const lastItem = numberItems[numberItems.length - 1];
    const timestamp = Date.now();
    const additions = Array.from({ length: targetCount - currentGroupKeys.length }, (_, offset) => {
      const itemIndex = numberItems.length + offset;
      return {
        ...lastItem,
        id: `ni_${timestamp}_${itemIndex}`,
        itemIndex,
        x: Math.max(0, lastItem.x),
        y: Math.max(0, lastItem.y + ((offset + 1) * Math.max(lastItem.height + 32, 70))),
      };
    });
    setNumberItems((items) => [...items, ...additions]);
    setPatternGroups((groups) => ({ ...groups, ...Object.fromEntries(additions.map((item, offset) => [item.id, `receipt_${timestamp}_${currentGroupKeys.length + offset + 1}`])) }));
    setPatternDefinitions((definitions) => [
      ...definitions,
      ...additions.map((_, offset) => ({ id: `receipt_${timestamp}_${currentGroupKeys.length + offset + 1}`, name: `Receipt ${currentGroupKeys.length + offset + 1}`, color: PATTERN_COLORS[(currentGroupKeys.length + offset) % PATTERN_COLORS.length] })),
    ]);
    setPreviewSheet(0);
  };

  const addPatternDefinition = () => {
    captureUndoState();
    const id = `pattern_${Date.now()}`;
    setPatternDefinitions((definitions) => [...definitions, { id, name: `Pattern ${String.fromCharCode(65 + definitions.length)}`, color: PATTERN_COLORS[definitions.length % PATTERN_COLORS.length] }]);
  };

  const removePatternDefinition = (patternId: string) => {
    if (patternDefinitions.length <= 1) return;
    captureUndoState();
    const replacement = patternDefinitions.find((definition) => definition.id !== patternId)!;
    setPatternGroups((groups) => Object.fromEntries(Object.entries(groups).map(([itemId, groupId]) => [itemId, groupId === patternId ? replacement.id : groupId])));
    setPatternDefinitions((definitions) => definitions.filter((definition) => definition.id !== patternId));
    setPreviewSheet(0);
  };

  const applyThreeUpCutStackPreset = () => {
    captureUndoState();
    const retained = numberItems.slice(0, 3).map((item, index) => ({ ...item, itemIndex: index, rotation: 0 }));
    const retainedIds = new Set(retained.map((item) => item.id));
    setNumberItems(retained);
    setSelectedIndex(0);
    setSelectedLayerIds(retained[0] ? [retained[0].id] : []);
    setLayerGroups((groups) => groups
      .map((group) => ({ ...group, itemIds: group.itemIds.filter((id) => retainedIds.has(id)) }))
      .filter((group) => group.itemIds.length > 1));
    setPatternGroups((groups) => Object.fromEntries(Object.entries(groups).filter(([itemId]) => retainedIds.has(itemId))));
    setPatternDefinitions((definitions) => definitions.slice(0, Math.max(1, retained.length)));
    setNumberArrangement('cut-stack');
    setFlowDirection('top-bottom');
    setShowNumberFlow(false);
    setConnectionDrag(null);
    setSelectedConnection(null);
    setPreviewSheet(0);
  };

  const applyThreePairLinkedPreset = (arrangement: 'linked-cut-stack' | 'linked-across-sheet') => {
    if (numberItems.length < 6) return;
    captureUndoState();
    const retained = numberItems.slice(0, 6).map((item, index) => ({ ...item, itemIndex: index }));
    const retainedIds = new Set(retained.map((item) => item.id));
    const pairDefinitions: PatternDefinition[] = [0, 1, 2].map((index) => ({
      id: `linked_pair_${index + 1}`,
      name: `Linked Pair ${index + 1} & ${index + 4}`,
      color: PATTERN_COLORS[index],
    }));
    const linkedGroups: Record<string, string> = {};
    [0, 1, 2].forEach((index) => {
      linkedGroups[retained[index].id] = pairDefinitions[index].id;
      linkedGroups[retained[index + 3].id] = pairDefinitions[index].id;
    });
    setNumberItems(retained);
    setPatternGroups(linkedGroups);
    setPatternDefinitions(pairDefinitions);
    setLayerGroups((groups) => groups
      .map((group) => ({ ...group, itemIds: group.itemIds.filter((id) => retainedIds.has(id)) }))
      .filter((group) => group.itemIds.length > 1));
    setNumberArrangement(arrangement);
    setFlowDirection('top-bottom');
    setShowNumberFlow(false);
    setSelectedIndex(0);
    setSelectedLayerIds([retained[0].id]);
    setSelectedPatternPositionIds([]);
    setSelectedConnection(null);
    setConnectionDrag(null);
    setPreviewSheet(0);
  };

  const togglePatternPositionSelection = (itemId: string) => {
    setSelectedPatternPositionIds((selected) => selected.includes(itemId) ? selected.filter((id) => id !== itemId) : [...selected, itemId]);
  };

  const groupSelectedPatternPositions = () => {
    if (selectedPatternPositionIds.length < 2) return;
    captureUndoState();
    const id = `pattern_${Date.now()}`;
    const groupNumber = patternDefinitions.length + 1;
    setPatternDefinitions((definitions) => [...definitions, { id, name: `Same Number Group ${groupNumber}`, color: PATTERN_COLORS[definitions.length % PATTERN_COLORS.length] }]);
    setPatternGroups((groups) => ({ ...groups, ...Object.fromEntries(selectedPatternPositionIds.map((itemId) => [itemId, id])) }));
    setSelectedPatternPositionIds([]);
    setShowNumberFlow(true);
    setPreviewSheet(0);
  };

  const linkSelectedLayersAsSameNumber = () => {
    const itemIds = selectedLayerIds.filter((id) => numberItems.some((item) => item.id === id));
    if (itemIds.length < 2) return;
    captureUndoState();
    const id = `pattern_${Date.now()}`;
    const groupNumber = patternDefinitions.length + 1;
    setPatternDefinitions((definitions) => [...definitions, { id, name: `Same Number Group ${groupNumber}`, color: PATTERN_COLORS[definitions.length % PATTERN_COLORS.length] }]);
    setPatternGroups((groups) => ({ ...groups, ...Object.fromEntries(itemIds.map((itemId) => [itemId, id])) }));
    setNumberArrangement(numberArrangement === 'across-sheet' || numberArrangement === 'linked-across-sheet' ? 'linked-across-sheet' : numberArrangement === 'cut-stack' || numberArrangement === 'linked-cut-stack' ? 'linked-cut-stack' : numberArrangement);
    setShowNumberFlow(true);
    setSelectedPatternPositionIds([]);
    setPreviewSheet(0);
  };

  const connectionKey = (groupId: string, firstId: string, secondId: string) => `${groupId}:${[firstId, secondId].sort().join(':')}`;

  const connectNumberPositions = (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    const sourceIndex = numberItems.findIndex((item) => item.id === fromId);
    const targetIndex = numberItems.findIndex((item) => item.id === toId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    captureUndoState();
    const groupId = patternGroups[fromId] || String(sourceIndex + 1);
    setPatternGroups((groups) => ({ ...groups, [fromId]: groupId, [toId]: groupId }));
    setSelectedConnection({ groupId, fromId, toId });
    setPreviewSheet(0);
  };

  const startConnectionDrag = (event: React.MouseEvent, item: NumberItem) => {
    if (!canvasContainerRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggingIdx(null);
    const center = getNumberBoxCenter(item);
    setConnectionDrag({ fromId: item.id, x: center.x, y: center.y });
  };

  const deleteSelectedConnection = () => {
    if (!selectedConnection) return;
    captureUndoState();
    const targetIndex = numberItems.findIndex((item) => item.id === selectedConnection.toId);
    const id = `pattern_${Date.now()}`;
    setPatternDefinitions((definitions) => [...definitions, { id, name: `Pattern ${String.fromCharCode(65 + definitions.length)}`, color: PATTERN_COLORS[definitions.length % PATTERN_COLORS.length] }]);
    setPatternGroups((groups) => ({ ...groups, [selectedConnection.toId]: id }));
    setReversedConnections((connections) => {
      const next = { ...connections };
      delete next[connectionKey(selectedConnection.groupId, selectedConnection.fromId, selectedConnection.toId)];
      return next;
    });
    if (targetIndex >= 0) setSelectedIndex(targetIndex);
    setSelectedConnection(null);
    setPreviewSheet(0);
  };

  const reverseSelectedConnection = () => {
    if (!selectedConnection) return;
    captureUndoState();
    const key = connectionKey(selectedConnection.groupId, selectedConnection.fromId, selectedConnection.toId);
    setReversedConnections((connections) => ({ ...connections, [key]: !connections[key] }));
    setSelectedConnection((connection) => connection ? { groupId: connection.groupId, fromId: connection.toId, toId: connection.fromId } : null);
  };

  // Remove a number position
  const handleRemoveNumberItem = (index: number) => {
    if (numberItems.length <= 1) return;
    captureUndoState();
    const updated = numberItems.filter((_, idx) => idx !== index);
    const removedId = numberItems[index]?.id;
    setNumberItems(updated);
    setPatternGroups((groups) => {
      const next = { ...groups };
      if (removedId) delete next[removedId];
      return next;
    });
    setSelectedLayerIds((ids) => ids.filter((id) => id !== removedId));
    setLayerGroups((groups) => groups
      .map((group) => ({ ...group, itemIds: group.itemIds.filter((id) => id !== removedId) }))
      .filter((group) => group.itemIds.length > 1));
    if (selectedIndex >= updated.length) {
      setSelectedIndex(updated.length - 1);
    }
  };

  // Sample number value calculation
  const getSampleNumberValue = () => {
    const prefix = numberSettings?.prefix || '';
    const suffix = numberSettings?.suffix || '';
    const start = numberSettings?.startNumber ?? 1;
    const padding = numberSettings?.padding ?? 4;
    return `${prefix}${String(start).padStart(padding, '0')}${suffix}`;
  };

  const handleLayerSelect = (event: React.MouseEvent, index: number) => {
    const item = numberItems[index];
    setSelectedIndex(index);
    setActiveGroupId(null);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      setSelectedLayerIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]);
    } else {
      setSelectedLayerIds([item.id]);
    }
  };

  const createLayerGroup = () => {
    if (selectedLayerIds.length < 2) return;
    captureUndoState();
    const group: LayerGroup = {
      id: `group_${Date.now()}`,
      name: `Number Group ${layerGroups.length + 1}`,
      itemIds: [...selectedLayerIds],
    };
    setLayerGroups((groups) => [...groups.filter((existing) => !existing.itemIds.some((id) => selectedLayerIds.includes(id))), group]);
    setActiveGroupId(group.id);
  };

  const selectLayerGroup = (group: LayerGroup) => {
    setActiveGroupId(group.id);
    setSelectedLayerIds(group.itemIds);
    const firstIndex = numberItems.findIndex((item) => group.itemIds.includes(item.id));
    if (firstIndex >= 0) setSelectedIndex(firstIndex);
  };

  const ungroupLayer = (groupId: string) => {
    setLayerGroups((groups) => groups.filter((group) => group.id !== groupId));
    if (activeGroupId === groupId) setActiveGroupId(null);
  };

  const startRenamingGroup = (group: LayerGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const finishRenamingGroup = () => {
    if (!editingGroupId) return;
    const nextName = editingGroupName.trim();
    if (nextName) {
      setLayerGroups((groups) => groups.map((group) => group.id === editingGroupId ? { ...group, name: nextName } : group));
    }
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  const applyNumberFlowOrder = (direction: typeof flowDirection) => {
    setFlowDirection(direction);
    if (direction === 'custom') return;
    const selectedId = numberItems[selectedIndex]?.id;
    const sorted = [...numberItems].sort((a, b) => {
      if (direction === 'top-bottom') return a.y - b.y || a.x - b.x;
      if (direction === 'bottom-top') return b.y - a.y || a.x - b.x;
      if (direction === 'left-right') return a.x - b.x || a.y - b.y;
      return b.x - a.x || a.y - b.y;
    }).map((item, index) => ({ ...item, itemIndex: index }));
    setNumberItems(sorted);
    const nextSelectedIndex = sorted.findIndex((item) => item.id === selectedId);
    if (nextSelectedIndex >= 0) setSelectedIndex(nextSelectedIndex);
    setPreviewSheet(0);
  };

  const changeZoom = (nextZoom: number) => {
    setPreviewZoom(Math.min(300, Math.max(25, nextZoom)));
  };

  const resetWorkspaceLayout = () => {
    setLeftPanelWidth(365);
    setRightPanelWidth(430);
    setLeftPanelCollapsed(false);
    setRightPanelCollapsed(false);
    setWorkspaceLocked(false);
    setPanelsHidden(false);
  };

  const toggleFullscreen = async () => {
    try {
      await toggleAppFullscreen();
    } catch (err) {
      setError(`Unable to change full screen mode: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const startPanelResize = (side: 'left' | 'right', event: React.MouseEvent) => {
    if (workspaceLocked || panelsHidden) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === 'left' ? leftPanelWidth : rightPanelWidth;
    const handleMove = (moveEvent: MouseEvent) => {
      const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const nextWidth = Math.min(480, Math.max(240, startWidth + delta));
      if (side === 'left') setLeftPanelWidth(nextWidth); else setRightPanelWidth(nextWidth);
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.classList.remove('workspace-resizing');
    };
    document.body.classList.add('workspace-resizing');
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const duplicateSelectedNumber = () => {
    const sourceIds = selectedLayerIds.length ? selectedLayerIds : [numberItems[selectedIndex]?.id].filter(Boolean) as string[];
    const sources = sourceIds.map((id) => numberItems.find((item) => item.id === id)).filter(Boolean) as NumberItem[];
    if (!sources.length) return;
    captureUndoState();
    const timestamp = Date.now();
    const duplicates = sources.map((source, index) => ({ ...source, id: `ni_${timestamp}_duplicate_${index}`, itemIndex: numberItems.length + index, x: source.x + 12, y: source.y + 12 }));
    setNumberItems((items) => [...items, ...duplicates]);
    setPatternGroups((groups) => {
      const next = { ...groups };
      sources.forEach((source, index) => {
        const sourceIndex = numberItems.findIndex((item) => item.id === source.id);
        const sourceGroupId = groups[source.id] || String(sourceIndex + 1);
        next[source.id] = sourceGroupId;
        next[duplicates[index].id] = sourceGroupId;
      });
      return next;
    });
    setNumberArrangement(numberArrangement === 'across-sheet' || numberArrangement === 'linked-across-sheet' ? 'linked-across-sheet' : numberArrangement === 'cut-stack' || numberArrangement === 'linked-cut-stack' ? 'linked-cut-stack' : numberArrangement);
    setShowNumberFlow(false);
    setSelectedIndex(numberItems.length);
    setSelectedLayerIds(duplicates.map((item) => item.id));
  };

  const duplicateNumberPosition = (sourceIndex: number, dragPoint?: { x: number; y: number }) => {
    const source = numberItems[sourceIndex];
    if (!source) return;
    captureUndoState();
    const duplicateIndex = numberItems.length;
    const duplicate: NumberItem = {
      ...source,
      id: `ni_${Date.now()}_duplicate_${duplicateIndex}`,
      itemIndex: duplicateIndex,
      x: source.x + (dragPoint ? 0 : 12),
      y: source.y + (dragPoint ? 0 : 12),
    };
    const sourceGroupId = patternGroups[source.id] || String(sourceIndex + 1);
    setNumberItems((items) => [...items, duplicate]);
    setPatternGroups((groups) => ({ ...groups, [source.id]: sourceGroupId, [duplicate.id]: sourceGroupId }));
    setNumberArrangement(numberArrangement === 'across-sheet' || numberArrangement === 'linked-across-sheet' ? 'linked-across-sheet' : 'linked-cut-stack');
    setSelectedIndex(duplicateIndex);
    setSelectedLayerIds([duplicate.id]);
    setActiveGroupId(null);
    if (dragPoint) {
      setDraggingIdx(duplicateIndex);
      dragStart.current = { x: dragPoint.x, y: dragPoint.y, initialX: source.x, initialY: source.y };
      pendingDragPositions.current = {};
    }
  };

  const linkNumberPositionToSelected = (targetIndex: number) => {
    const source = numberItems[selectedIndex];
    const target = numberItems[targetIndex];
    if (!source || !target || source.id === target.id) return;
    connectNumberPositions(source.id, target.id);
    setNumberArrangement(numberArrangement === 'across-sheet' || numberArrangement === 'linked-across-sheet' ? 'linked-across-sheet' : 'linked-cut-stack');
  };

  const nudgeSelectedNumbers = (dx: number, dy: number) => {
    const ids = selectedLayerIds.length ? selectedLayerIds : [numberItems[selectedIndex]?.id].filter(Boolean) as string[];
    if (!ids.length) return;
    captureUndoState();
    setNumberItems((items) => items.map((item) => ids.includes(item.id) ? { ...item, x: Math.max(0, item.x + dx), y: Math.max(0, item.y + dy) } : item));
  };

  const rotateSelectedNumbers = (degrees: number) => {
    const ids = selectedLayerIds.length ? selectedLayerIds : [numberItems[selectedIndex]?.id].filter(Boolean) as string[];
    if (!ids.length) return;
    captureUndoState();
    setNumberItems((items) => items.map((item) => {
      if (!ids.includes(item.id)) return item;
      const rotation = (((item.rotation || 0) + degrees) % 360 + 360) % 360;
      return { ...item, rotation };
    }));
  };

  shortcutHandlerRef.current = (event: KeyboardEvent) => {
      const target = event.target;
      const isTextField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && !isTextField && key === 'z') { event.preventDefault(); if (event.shiftKey) redoEditorChange(); else undoEditorChange(); return; }
      if (modifier && !isTextField && key === 'y') { event.preventDefault(); redoEditorChange(); return; }
      if (event.code === 'Space' && !isTextField) { event.preventDefault(); setSpacePressed(true); return; }
      if (isTextField) return;
      if (key === 'f' && !modifier) { event.preventDefault(); void toggleFullscreen(); return; }
      if (event.key === 'Tab' && !modifier) { event.preventDefault(); setPanelsHidden((hidden) => !hidden); return; }
      if (key === 'h' && !modifier) { event.preventDefault(); setPanMode(true); return; }
      if (key === 'v' && !modifier) { event.preventDefault(); setPanMode(false); return; }
      if (modifier && event.shiftKey && key === 'l') { event.preventDefault(); setWorkspaceLocked((locked) => !locked); return; }
      if (modifier && event.shiftKey && key === 'r') { event.preventDefault(); resetWorkspaceLayout(); return; }
      if (!modifier && event.key === '[' && !workspaceLocked) { event.preventDefault(); setLeftPanelCollapsed((collapsed) => !collapsed); return; }
      if (!modifier && event.key === ']' && !workspaceLocked) { event.preventDefault(); setRightPanelCollapsed((collapsed) => !collapsed); return; }
      if (key === '?' || (event.shiftKey && event.key === '/')) { event.preventDefault(); setShowShortcutsDialog(true); return; }
      if (event.key === 'Escape') { setShowShortcutsDialog(false); setShowExportDialog(false); setSelectedLayerIds([]); setSelectedPatternPositionIds([]); setSelectedConnection(null); return; }
      if (modifier && key === 'j') { event.preventDefault(); duplicateSelectedNumber(); return; }
      if (modifier && key === 'g' && !event.shiftKey) { event.preventDefault(); createLayerGroup(); return; }
      if (modifier && key === 'g' && event.shiftKey) { event.preventDefault(); if (activeGroupId) { captureUndoState(); ungroupLayer(activeGroupId); } return; }
      if (modifier && event.altKey && event.shiftKey && key === 'w') { event.preventDefault(); if (canvasSrc) setShowExportDialog(true); return; }
      if (modifier && event.key === '=') { event.preventDefault(); changeZoom(previewZoom + 10); return; }
      if (modifier && event.key === '-') { event.preventDefault(); changeZoom(previewZoom - 10); return; }
      if (key === 'n' && event.shiftKey && !modifier) { event.preventDefault(); handleAddNumberItem(); return; }
      if (key === 'r' && !modifier) { event.preventDefault(); rotateSelectedNumbers(event.shiftKey ? -90 : 90); return; }
      if (modifier && (key === "'" || key === '’')) { event.preventDefault(); setShowGrid((visible) => !visible); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && numberItems.length > 1) { event.preventDefault(); handleRemoveNumberItem(selectedIndex); return; }
      const distance = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeSelectedNumbers(-distance, 0); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSelectedNumbers(distance, 0); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); nudgeSelectedNumbers(0, -distance); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); nudgeSelectedNumbers(0, distance); }
  };

  const exportNumbers = (() => {
    const start = numberSettings?.startNumber ?? 1;
    const end = numberSettings?.endNumber ?? 100;
    const stepValue = Math.max(1, numberSettings?.step ?? 1);
    const paddingValue = Math.max(0, numberSettings?.padding ?? 4);
    const values: string[] = [];
    for (let value = start; value <= end; value += stepValue) {
      values.push(`${numberSettings?.prefix || ''}${String(value).padStart(paddingValue, '0')}${numberSettings?.suffix || ''}`);
    }
    return values;
  })();
  const customPatternKeys = numberItems.map((item, index) => patternGroups[item.id] || String(index + 1));
  const numberLayout = createNumberLayoutPlan(exportNumbers.length, numberItems.length, numberArrangement, customPatternKeys);
  const uniquePatternKeys = numberLayout.groupKeys;
  const exportPageCount = numberLayout.pageCount;
  const safePreviewSheet = Math.min(Math.max(0, previewSheet), Math.max(0, exportPageCount - 1));
  const previewSheetNumbers = numberItems.map((_, index) => {
    const numberIndex = numberLayout.numberIndexFor(safePreviewSheet, index);
    return exportNumbers[numberIndex] ?? '';
  });
  const positionNumberIndexes = numberItems.map((_, index) => Array.from(
    { length: exportPageCount },
    (_, pageIndex) => numberLayout.numberIndexFor(pageIndex, index),
  ).filter((numberIndex) => numberIndex >= 0 && numberIndex < exportNumbers.length));
  const positionRanges = numberItems.map((_, index) => {
    const patternIndex = uniquePatternKeys.indexOf(customPatternKeys[index]);
    if (!exportNumbers.length) return 'Empty';
    if (numberArrangement === 'same-number') {
      return `Linked · ${exportNumbers[0]}–${exportNumbers[exportNumbers.length - 1]}`;
    }
    if (numberArrangement === 'custom-pattern') {
      return `Pattern ${customPatternKeys[index]} · linked positions share a number`;
    }
    if (numberArrangement === 'linked-across-sheet') {
      return `Linked across sheet · group ${patternIndex + 1}`;
    }
    if (numberArrangement === 'linked-cut-stack') {
      const indexes = positionNumberIndexes[index];
      return indexes.length ? `Linked · ${exportNumbers[indexes[0]]}–${exportNumbers[indexes[indexes.length - 1]]}` : 'Empty';
    }
    if (numberArrangement === 'cut-stack') {
      const indexes = positionNumberIndexes[index];
      return indexes.length ? `${exportNumbers[indexes[0]]}–${exportNumbers[indexes[indexes.length - 1]]}` : 'Empty';
    }
    return `Step ${index + 1} on every sheet`;
  });

  const handleExportPdf = async () => {
    if (!canvasSrc || !canvasSize) {
      setError('Import a template and wait for its preview before exporting.');
      return;
    }
    try {
      setIsLoading(true);
      setExportProgress({ current: 0, total: exportPageCount });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const sourceRatio = canvasSize.width / canvasSize.height;
      let pageWidth = exportPaperSize === 'A3' ? 841.89 : 595.28;
      let pageHeight = exportPaperSize === 'A3' ? 1190.55 : 841.89;
      if (exportPaperSize === 'source') {
        pageHeight = 841.89;
        pageWidth = pageHeight * sourceRatio;
      }
      if (exportOrientation === 'landscape' && pageHeight > pageWidth) [pageWidth, pageHeight] = [pageHeight, pageWidth];
      if (exportOrientation === 'portrait' && pageWidth > pageHeight) [pageWidth, pageHeight] = [pageHeight, pageWidth];
      const pdf = await generateNumberedPdf({
        imageSource: canvasSrc,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
        numbers: exportNumbers,
        positions: numberItems,
        pageWidthPoints: pageWidth,
        pageHeightPoints: pageHeight,
        quality: exportQuality / 100,
        arrangement: numberArrangement,
        patternGroups: customPatternKeys,
        includeBackground: exportContent === 'design-numbers',
      }, (current, total) => setExportProgress({ current, total }));
      await api.saveExportedPdf(exportFileName || 'recipta-numbered.pdf', pdf);
      setShowExportDialog(false);
    } catch (err) {
      setError(`PDF export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportProgress(null);
      setIsLoading(false);
    }
  };

  const linkedCopiesEnabled = numberArrangement === 'linked-across-sheet' || numberArrangement === 'linked-cut-stack';
  const primaryFlowMode: 'across-sheet' | 'cut-stack' | 'same-number' | 'custom-pattern' =
    numberArrangement === 'linked-across-sheet' ? 'across-sheet' :
      numberArrangement === 'linked-cut-stack' ? 'cut-stack' : numberArrangement;
  const selectPrimaryFlow = (mode: 'across-sheet' | 'cut-stack' | 'same-number' | 'custom-pattern') => {
    const nextMode = linkedCopiesEnabled && mode === 'across-sheet'
      ? 'linked-across-sheet'
      : linkedCopiesEnabled && mode === 'cut-stack'
        ? 'linked-cut-stack'
        : mode;
    setNumberArrangement(nextMode);
    setShowNumberFlow(mode === 'custom-pattern');
    setConnectionDrag(null);
    setPreviewSheet(0);
  };
  const toggleLinkedCopies = () => {
    if (primaryFlowMode !== 'across-sheet' && primaryFlowMode !== 'cut-stack') return;
    setNumberArrangement(linkedCopiesEnabled
      ? primaryFlowMode
      : primaryFlowMode === 'across-sheet' ? 'linked-across-sheet' : 'linked-cut-stack');
    setShowNumberFlow(false);
    if (linkedCopiesEnabled) setShowConnectionEditor(false);
    setConnectionDrag(null);
    setPreviewSheet(0);
  };

  const handleNumberItemChange = (idx: number, updatedItem: NumberItem) => {
    const currentItem = numberItems[idx];
    if (currentItem && currentItem.numberValue === updatedItem.numberValue && currentItem.x === updatedItem.x && currentItem.y === updatedItem.y && currentItem.rotation === updatedItem.rotation && currentItem.fontFamily === updatedItem.fontFamily && currentItem.fontSize === updatedItem.fontSize && currentItem.fontStyle === updatedItem.fontStyle && currentItem.fontColor === updatedItem.fontColor && currentItem.alignment === updatedItem.alignment) return;
    captureUndoState();
    setNumberItems((prev) => {
      const previousItem = prev[idx];
      const activeGroup = layerGroups.find((group) => group.id === activeGroupId && group.itemIds.includes(updatedItem.id));
      if (!activeGroup || !previousItem) {
        return prev.map((item, index) => index === idx ? updatedItem : item);
      }
      const dx = updatedItem.x - previousItem.x;
      const dy = updatedItem.y - previousItem.y;
      return prev.map((item, index) => {
        if (!activeGroup.itemIds.includes(item.id)) return item;
        if (index === idx) return updatedItem;
        return {
          ...item,
          x: Math.max(0, item.x + dx),
          y: Math.max(0, item.y + dy),
          rotation: updatedItem.rotation,
          fontFamily: updatedItem.fontFamily,
          fontSize: updatedItem.fontSize,
          fontStyle: updatedItem.fontStyle,
          fontColor: updatedItem.fontColor,
          alignment: updatedItem.alignment,
        };
      });
    });
  };

  const selectedNumberItem = numberItems[selectedIndex];
  const updateSelectedNumberPosition = (changes: Partial<Pick<NumberItem, 'x' | 'y' | 'rotation'>>) => {
    if (!selectedNumberItem) return;
    handleNumberItemChange(selectedIndex, { ...selectedNumberItem, ...changes });
  };

  return (
    <div className="editor" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Editor Toolbar */}
      <div className="editor-toolbar">
        <div className="header-grid-menu" ref={gridMenuRef}>
          <button
            className={`btn btn-ghost btn-sm editor-grid-trigger ${(showGrid || showGridMenu) ? 'toolbar-control-active' : ''}`}
            onClick={() => setShowGridMenu((open) => !open)}
            aria-expanded={showGridMenu}
            aria-haspopup="dialog"
            title="Grid, snapping, and ruler guide settings"
          >
            ▦ Grid {showGrid ? 'On' : 'Off'} {showGridMenu ? '⌃' : '⌄'}
          </button>
          {showGridMenu && <div className="header-grid-dropdown" role="dialog" aria-label="Grid settings">
            <div className="header-grid-dropdown-title"><span>Grid &amp; Guides</span><button onClick={() => setShowGridMenu(false)} aria-label="Close grid settings">×</button></div>
            <label className="header-grid-toggle"><span>Show grid lines</span><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /></label>
            <label className="header-grid-toggle"><span>Snap positions</span><input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} /></label>
            <div className="header-grid-fields"><label><span>Horizontal</span><input type="number" min="2" max="500" value={gridX} onChange={(event) => setGridX(Math.max(2, Number(event.target.value) || 2))} /></label><label><span>Vertical</span><input type="number" min="2" max="500" value={gridY} onChange={(event) => setGridY(Math.max(2, Number(event.target.value) || 2))} /></label></div>
            <label className="header-grid-opacity"><span>Opacity <b>{gridOpacity}%</b></span><input type="range" min="10" max="90" step="5" value={gridOpacity} onChange={(event) => setGridOpacity(Number(event.target.value))} /></label>
            <div className="header-guide-summary"><span>Ruler guides: {verticalGuides.length + horizontalGuides.length}</span>{(verticalGuides.length > 0 || horizontalGuides.length > 0) && <button onClick={() => { setVerticalGuides([]); setHorizontalGuides([]); }}>Clear guides</button>}</div>
            <small>Drag from the top or left ruler to create a guide. Click the ruler corner to toggle the grid.</small>
          </div>}
        </div>

        {selectedNumberItem && <div className="header-rotation-controls" aria-label={`Number position ${selectedIndex + 1} rotation`}>
          <span>Position #{selectedIndex + 1}</span>
          <label>Rotation <input type="number" value={selectedNumberItem.rotation} onChange={(event) => updateSelectedNumberPosition({ rotation: Number(event.target.value) || 0 })} /></label>
          <select value={[0, 90, 180, 270].includes(selectedNumberItem.rotation) ? selectedNumberItem.rotation : 'custom'} onChange={(event) => event.target.value !== 'custom' && updateSelectedNumberPosition({ rotation: Number(event.target.value) })} aria-label="Rotation preset">
            <option value="custom">Preset</option>
            <option value={0}>0°</option>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        </div>}
        <button className="btn btn-ghost btn-sm" onClick={handleImportImage}>
          {currentAsset ? '📷 Change Image' : '📷 Import Image'}
        </button>
        {currentAsset && <span className="editor-template-name" title={currentAsset.originalFilename}>📄 {currentAsset.originalFilename}</span>}
        <div className="editor-toolbar-spacer" />
        <div className="zoom-controls" aria-label="Preview zoom controls">
          <button className="zoom-button" onClick={() => changeZoom(previewZoom - 10)} title="Zoom out">−</button>
          <select
            className="zoom-select"
            value={previewZoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            aria-label="Preview zoom"
          >
            {![25, 50, 75, 100, 125, 150, 200, 300].includes(previewZoom) && (
              <option value={previewZoom}>{previewZoom}%</option>
            )}
            {[25, 50, 75, 100, 125, 150, 200, 300].map((value) => (
              <option key={value} value={value}>{value}%</option>
            ))}
          </select>
          <button className="zoom-button" onClick={() => changeZoom(previewZoom + 10)} title="Zoom in">+</button>
        </div>
      </div>

      {showShortcutsDialog && (
        <div className="dialog-overlay" onClick={() => setShowShortcutsDialog(false)}>
          <div className="dialog shortcuts-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="export-dialog-heading"><div><span className="dashboard-eyebrow">Editor controls</span><h2 className="dialog-title">Keyboard shortcuts</h2></div><button onClick={() => setShowShortcutsDialog(false)} aria-label="Close shortcuts">×</button></div>
            <div className="shortcuts-grid">
              <section><h3>History</h3><div><span>Undo</span><kbd>Ctrl/⌘ Z</kbd></div><div><span>Redo</span><kbd>Ctrl/⌘ Shift Z</kbd></div><div><span>Redo alternative</span><kbd>Ctrl/⌘ Y</kbd></div></section>
              <section><h3>Number layers</h3><div><span>Add number position</span><kbd>Shift N</kbd></div><div><span>Duplicate linked text</span><kbd>Ctrl/⌘ J</kbd></div><div><span>Duplicate by dragging</span><kbd>Alt/⌥ + Drag</kbd></div><div><span>Delete selected</span><kbd>Delete</kbd></div><div><span>Group layers</span><kbd>Ctrl/⌘ G</kbd></div><div><span>Ungroup</span><kbd>Ctrl/⌘ Shift G</kbd></div></section>
              <section><h3>Tools &amp; position</h3><div><span>Select / Move tool</span><kbd>V</kbd></div><div><span>Hand / Pan tool</span><kbd>H</kbd></div><div><span>Temporary Hand tool</span><kbd>Hold Space</kbd></div><div><span>Rotate 90° clockwise</span><kbd>R</kbd></div><div><span>Rotate 90° counter-clockwise</span><kbd>Shift R</kbd></div><div><span>Nudge 1 px</span><kbd>Arrow keys</kbd></div><div><span>Nudge 10 px</span><kbd>Shift + Arrow</kbd></div></section>
              <section><h3>View &amp; output</h3><div><span>Full screen mode</span><kbd>F</kbd></div><div><span>Hide/show panels</span><kbd>Tab</kbd></div><div><span>Collapse left panel</span><kbd>[</kbd></div><div><span>Collapse right panel</span><kbd>]</kbd></div><div><span>Toggle grid</span><kbd>Ctrl/⌘ '</kbd></div><div><span>Zoom in</span><kbd>Ctrl/⌘ +</kbd></div><div><span>Zoom out</span><kbd>Ctrl/⌘ −</kbd></div><div><span>Export PDF</span><kbd>Ctrl/⌘ Alt/⌥ Shift W</kbd></div></section>
              <section><h3>Workspace</h3><div><span>Lock/unlock layout</span><kbd>Ctrl/⌘ Shift L</kbd></div><div><span>Reset panel layout</span><kbd>Ctrl/⌘ Shift R</kbd></div><div><span>Resize panels</span><kbd>Drag divider</kbd></div></section>
              <section><h3>General</h3><div><span>Close / clear selection</span><kbd>Esc</kbd></div><div><span>Show shortcuts</span><kbd>?</kbd></div></section>
            </div>
            <div className="dialog-actions"><button className="btn btn-primary" onClick={() => setShowShortcutsDialog(false)}>Done</button></div>
          </div>
        </div>
      )}

      {showExportDialog && (
        <div className="dialog-overlay" onClick={() => !exportProgress && setShowExportDialog(false)}>
          <div className="dialog export-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="export-dialog-heading">
              <div><span className="dashboard-eyebrow">Batch output</span><h2 className="dialog-title">Export numbered PDF</h2></div>
              <button onClick={() => setShowExportDialog(false)} disabled={!!exportProgress} aria-label="Close export settings">×</button>
            </div>
            <div className="export-summary">
              <div><strong>{exportNumbers.length}</strong><span>Numbered copies</span></div>
              <div><strong>{numberItems.length}</strong><span>Items per page</span></div>
              <div><strong>{exportPageCount}</strong><span>PDF pages</span></div>
            </div>
            <div className="export-flow-preview">
              <span>Sheet 1: {numberItems.map((_, index) => exportNumbers[numberLayout.numberIndexFor(0, index)]).filter(Boolean).join(' · ') || 'No numbers'}</span>
              <b>→</b>
              <span>{exportNumbers.length ? exportNumbers[exportNumbers.length - 1] : '—'}</span>
            </div>
            <div className="export-content-section">
              <span className="export-section-label">Export content</span>
              <div className="export-content-selector">
                <button className={exportContent === 'design-numbers' ? 'active' : ''} onClick={() => setExportContent('design-numbers')}>
                  <span className="export-content-icon">▧</span><strong>Design + Numbers</strong><small>Template artwork with added numbering</small>
                </button>
                <button className={exportContent === 'numbers-only' ? 'active' : ''} onClick={() => setExportContent('numbers-only')}>
                  <span className="export-content-icon text">T</span><strong>Numbers Only</strong><small>Remove artwork for preprinted sheets</small>
                </button>
              </div>
              {exportContent === 'numbers-only' && <div className="numbers-only-notice"><span>✓</span> Background artwork will be removed. Only number text will appear on a white PDF page.</div>}
            </div>
            <div className="export-settings-grid">
              <label className="export-field export-field-wide"><span>File name</span><input value={exportFileName} onChange={(e) => setExportFileName(e.target.value)} /></label>
              <label className="export-field"><span>Paper size</span><select value={exportPaperSize} onChange={(e) => setExportPaperSize(e.target.value as 'A4' | 'A3' | 'source')}><option value="A4">A4</option><option value="A3">A3</option><option value="source">Match source</option></select></label>
              <label className="export-field"><span>Orientation</span><select value={exportOrientation} onChange={(e) => setExportOrientation(e.target.value as 'portrait' | 'landscape')}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
              <label className="export-field export-field-wide"><span>Image quality <b>{exportQuality}%</b></span><input type="range" min="50" max="100" step="5" value={exportQuality} onChange={(e) => setExportQuality(Number(e.target.value))} /></label>
            </div>
            <div className="export-note"><span>i</span><p>{numberArrangement === 'linked-across-sheet' ? 'Linked Across Sheet: primary positions advance across each sheet and every linked duplicate prints its source number.' : numberArrangement === 'linked-cut-stack' ? 'Linked Cut & Stack: each primary position receives a cut-stack range and every linked duplicate prints its source number.' : numberArrangement === 'custom-pattern' ? 'Custom Pattern: positions assigned to the same pattern share a number; each different pattern receives the next sequence value.' : numberArrangement === 'same-number' ? 'Same Number: every linked position receives the identical number for coupon-and-stub printing, then advances on the next PDF page.' : numberArrangement === 'cut-stack' ? 'Cut & Stack: each position receives its own continuous range so cut piles can be stacked in sequence.' : 'Across Sheet: numbers fill every position in order, then continue on the next PDF page.'}</p></div>
            <div className="export-hidden-layers"><span>Not exported:</span> grid · rulers · guides · selection boxes · flow arrows · layer labels</div>
            {exportProgress && <div className="export-progress"><div><span>Rendering page {exportProgress.current} of {exportProgress.total}</span><b>{Math.round((exportProgress.current / Math.max(1, exportProgress.total)) * 100)}%</b></div><progress value={exportProgress.current} max={exportProgress.total} /></div>}
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setShowExportDialog(false)} disabled={!!exportProgress}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExportPdf} disabled={!!exportProgress || !exportNumbers.length}>{exportProgress ? 'Generating PDF…' : `Export ${exportPageCount} pages`}</button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Main Area */}
      <div className={`editor-main ${panelsHidden ? 'workspace-panels-hidden' : ''} ${workspaceLocked ? 'workspace-locked' : ''}`}>
        {/* Left Sidebar — Tools & Layers */}
        <aside className={`editor-sidebar-left ${leftPanelCollapsed ? 'panel-collapsed' : ''}`} style={{ width: leftPanelCollapsed ? 34 : leftPanelWidth }}>
          <div className="panel-dock-controls">
            {!leftPanelCollapsed && <span>Tools &amp; Layers</span>}
            <button onClick={() => !workspaceLocked && setLeftPanelCollapsed((collapsed) => !collapsed)} disabled={workspaceLocked} title={leftPanelCollapsed ? 'Expand left panel' : 'Collapse left panel'}>{leftPanelCollapsed ? '›' : '‹'}</button>
          </div>
          <div ref={setNumberPositionsTarget} className="number-positions-left-target" />
          {numberFlowTarget && createPortal(<div className="panel-section number-flow-panel">
            <div className="layer-panel-heading">
              <div className="panel-section-title">Number Flow</div>
              <span>{numberItems.length} steps</span>
            </div>
            <div className="arrangement-selector">
              <button className={primaryFlowMode === 'across-sheet' ? 'active' : ''} onClick={() => selectPrimaryFlow('across-sheet')}>
                <span>1·2·3</span><strong>Across sheet</strong><small>Fill positions, then next sheet</small>
              </button>
              <button className={primaryFlowMode === 'cut-stack' ? 'active' : ''} onClick={() => selectPrimaryFlow('cut-stack')}>
                <span>1│101│201</span><strong>Cut &amp; stack</strong><small>One range per position</small>
              </button>
            </div>
            <button className={`connection-editor-toggle ${showAdvancedFlow ? 'active' : ''}`} onClick={() => setShowAdvancedFlow((visible) => !visible)} aria-expanded={showAdvancedFlow}>
              <span>⚙</span><span><strong>{showAdvancedFlow ? 'Hide advanced flow options' : 'Advanced flow options'}</strong><small>Copies, direction, ranges and connections</small></span><b>{showAdvancedFlow ? '▴' : '▾'}</b>
            </button>
            {showAdvancedFlow && <>
            {(primaryFlowMode === 'across-sheet' || primaryFlowMode === 'cut-stack') && (
              <button className={`linked-copies-toggle ${linkedCopiesEnabled ? 'active' : ''}`} onClick={toggleLinkedCopies} role="switch" aria-checked={linkedCopiesEnabled}>
                <span className="linked-copies-switch"><i /></span>
                <span><strong>Linked copies</strong><small>Use matching numbers in duplicated positions</small></span>
              </button>
            )}
            {linkedCopiesEnabled && <div className="linked-cut-stack-preset">
              <div><strong>3 paired receipts</strong><small>1 ↔ 4 &nbsp;·&nbsp; 2 ↔ 5 &nbsp;·&nbsp; 3 ↔ 6</small></div>
              <div className="linked-preset-actions"><button onClick={() => applyThreePairLinkedPreset('linked-across-sheet')} disabled={numberItems.length < 6}>Across: 1 · 2 · 3</button><button onClick={() => applyThreePairLinkedPreset('linked-cut-stack')} disabled={numberItems.length < 6}>Cut-stack: 1 · 35 · 69</button></div>
              {numberItems.length < 6 && <span>Add or duplicate until there are 6 number layers.</span>}
            </div>}
            {linkedCopiesEnabled && (
              <div className="linked-details-controls">
                <button className={`connection-editor-toggle ${showConnectionEditor ? 'active' : ''}`} onClick={() => setShowConnectionEditor((visible) => !visible)}>
                  <span>⌁</span><span><strong>{showConnectionEditor ? 'Hide connections' : 'Edit connections'}</strong><small>Advanced matching, names and flow arrows</small></span><b>{showConnectionEditor ? '▴' : '▾'}</b>
                </button>
                <button className={`link-summary-toggle ${showLinkSummary ? 'active' : ''}`} onClick={() => setShowLinkSummary((visible) => !visible)}>
                  <span>☷</span><span><strong>{showLinkSummary ? 'Hide Link Summary' : 'View Link Summary'}</strong><small>{numberItems.length} positions in {uniquePatternKeys.length} groups</small></span><b>{showLinkSummary ? '▴' : '▾'}</b>
                </button>
              </div>
            )}
            {(primaryFlowMode === 'cut-stack') && <div className="three-up-preset">
              <div><span>3-UP</span><p><strong>Receipt Cut &amp; Stack</strong><small>Creates 0001 · 0035 · 0069 for a 1–100 sequence.</small></p></div>
              <button onClick={applyThreeUpCutStackPreset} disabled={numberItems.length < 3}>{numberItems.length > 3 ? `Apply & remove ${numberItems.length - 3} extra` : 'Apply setup'}</button>
            </div>}
            {numberArrangement === 'same-number' && (
              <div className="linked-number-notice">
                <span>⌁</span>
                <div><strong>Positions are linked</strong><small>Every position prints the same number. The sequence advances once per sheet.</small></div>
              </div>
            )}
            {(numberArrangement === 'custom-pattern' || (linkedCopiesEnabled && showConnectionEditor)) && (
              <div className="custom-pattern-editor">
                <div className="custom-pattern-help"><strong>Connection patterns</strong><small>Rename, add, remove, and assign any number position.</small></div>
                <div className="pattern-definition-list">
                  {patternDefinitions.map((definition) => (
                    <div key={definition.id} className="pattern-definition-row">
                      <span className="pattern-color" style={{ background: definition.color }} />
                      <input
                        value={definition.name}
                        onChange={(event) => setPatternDefinitions((definitions) => definitions.map((entry) => entry.id === definition.id ? { ...entry, name: event.target.value } : entry))}
                        aria-label="Pattern name"
                      />
                      <button onClick={() => removePatternDefinition(definition.id)} disabled={patternDefinitions.length <= 1} title="Remove pattern">×</button>
                    </div>
                  ))}
                  <button className="add-pattern-button" onClick={addPatternDefinition}>+ Add connection pattern</button>
                </div>
                <div className="pattern-assignment-title">Position connections</div>
                {numberItems.map((item, index) => (
                  <label key={item.id}>
                    <span>Position {index + 1}</span>
                    <select
                      value={patternGroups[item.id] || String(index + 1)}
                      onChange={(event) => { setPatternGroups((groups) => ({ ...groups, [item.id]: event.target.value })); setPreviewSheet(0); }}
                    >
                      {patternDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
                    </select>
                  </label>
                ))}
                <div className="drag-connection-help"><span>↗</span><div><strong>Drag to connect</strong><small>Select a number box, then drag its round connection handle onto another box.</small></div></div>
                {selectedConnection && (
                  <div className="selected-connection-actions">
                    <span>Selected: Position {numberItems.findIndex((item) => item.id === selectedConnection.fromId) + 1} → {numberItems.findIndex((item) => item.id === selectedConnection.toId) + 1}</span>
                    <div><button onClick={reverseSelectedConnection}>⇄ Reverse flow</button><button className="danger" onClick={deleteSelectedConnection}>× Delete arrow</button></div>
                  </div>
                )}
                <div className="custom-pattern-example">Sheet {safePreviewSheet + 1}: {previewSheetNumbers.filter(Boolean).join(' · ') || 'No numbers'}</div>
              </div>
            )}
            {(numberArrangement === 'cut-stack' || (linkedCopiesEnabled && showLinkSummary)) && (
              <div className="cut-stack-ranges">
                {positionRanges.map((range, index) => <div key={numberItems[index].id}><span>Position {index + 1}</span><strong>{range}</strong></div>)}
              </div>
            )}
            <div className="flow-field">
              <span>Fill direction</span>
              <div className="flow-direction-menu">
                {([
                  ['top-bottom', '↓', 'Top to bottom'],
                  ['bottom-top', '↑', 'Bottom to top'],
                  ['left-right', '→', 'Left to right'],
                  ['right-left', '←', 'Right to left'],
                  ['custom', '☷', 'Custom layer order'],
                ] as const).map(([value, icon, label]) => (
                  <button key={value} className={flowDirection === value ? 'active' : ''} onClick={() => applyNumberFlowOrder(value)}>
                    <span>{icon}</span><strong>{label}</strong>{flowDirection === value && <b>✓</b>}
                  </button>
                ))}
              </div>
              {numberItems.length < 2 && <small className="flow-direction-hint">Add another number position to activate direction ordering.</small>}
            </div>
            {(numberArrangement === 'custom-pattern' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet') && <label className="grid-toggle-row flow-toggle-row">
              <span>Show connection arrows</span>
              <span className="toggle-switch"><input type="checkbox" checked={showNumberFlow} onChange={(event) => setShowNumberFlow(event.target.checked)} /><span className="toggle-switch-track"><span /></span></span>
            </label>}
            <div className="flow-route">
              {numberItems.map((item, index) => (
                <React.Fragment key={item.id}>
                  <button
                    onClick={() => {
                      if (numberArrangement === 'custom-pattern' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet') togglePatternPositionSelection(item.id);
                      else { setSelectedIndex(index); setSelectedLayerIds([item.id]); setActiveGroupId(null); }
                    }}
                    className={`${selectedIndex === index && numberArrangement !== 'custom-pattern' && numberArrangement !== 'linked-cut-stack' && numberArrangement !== 'linked-across-sheet' ? 'active' : ''} ${selectedPatternPositionIds.includes(item.id) ? 'pattern-selected' : ''}`}
                    title={numberArrangement === 'custom-pattern' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet' ? `Select position ${index + 1} for same-number grouping` : `Position ${index + 1}`}
                  >{index + 1}</button>
                  {index < numberItems.length - 1 && <span>→</span>}
                </React.Fragment>
              ))}
              <span className="flow-next-sheet">Next sheet</span>
            </div>
            {(numberArrangement === 'custom-pattern' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet') && (
              <div className="quick-pattern-grouping">
                <span>{selectedPatternPositionIds.length ? `${selectedPatternPositionIds.length} positions selected` : 'Select two or more position boxes above'}</span>
                <button onClick={groupSelectedPatternPositions} disabled={selectedPatternPositionIds.length < 2}>⌁ Group as Same Number</button>
                {selectedPatternPositionIds.length > 0 && <button className="clear" onClick={() => setSelectedPatternPositionIds([])}>Clear selection</button>}
              </div>
            )}
            <div className="flow-summary">Sheet {safePreviewSheet + 1}: <strong>{previewSheetNumbers.filter(Boolean).join(' · ') || 'No numbers'}</strong></div>
            </>}
          </div>, numberFlowTarget)}

          <div className="panel-section imported-template-panel">
            <div className="panel-section-title">Imported Template</div>
            {currentAsset ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                <div style={{ wordBreak: 'break-all', marginBottom: '8px' }}>
                  📄 <strong>{currentAsset.originalFilename}</strong>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%' }}
                onClick={handleImportImage}
              >
                + Import Image File
              </button>
            )}
          </div>

          <div className="panel-section layers-panel-section">
            <div className="layer-panel-heading">
              <div className="panel-section-title">Layers</div>
              <span>{layerGroups.length + 1}</span>
            </div>
            <div className="layer-selection-toolbar">
              <span>{selectedLayerIds.length} selected</span>
              <div>
                <button className="duplicate-linked-button" disabled={selectedLayerIds.length === 0} onClick={duplicateSelectedNumber}>⧉ Duplicate Text</button>
                <button disabled={selectedLayerIds.length < 2} onClick={createLayerGroup}>Group Layers</button>
                <button className="link-number-button" disabled={selectedLayerIds.length < 2} onClick={linkSelectedLayersAsSameNumber}>⌁ Same Number</button>
              </div>
            </div>

            {layerGroups.length > 0 && (
              <div className="layer-groups-list">
                {layerGroups.map((group) => (
                  <div key={group.id} className={`layer-group ${activeGroupId === group.id ? 'active' : ''}`}>
                    <div className="layer-group-main" role="button" tabIndex={0} onClick={() => selectLayerGroup(group)} onDoubleClick={() => startRenamingGroup(group)} onKeyDown={(event) => event.key === 'Enter' && selectLayerGroup(group)}>
                      <span className="layer-group-icon">▦</span>
                      {editingGroupId === group.id ? (
                        <input
                          className="layer-group-name-input"
                          value={editingGroupName}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setEditingGroupName(event.target.value)}
                          onBlur={finishRenamingGroup}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === 'Enter') finishRenamingGroup();
                            if (event.key === 'Escape') { setEditingGroupId(null); setEditingGroupName(''); }
                          }}
                          autoFocus
                        />
                      ) : <span><strong>{group.name}</strong><small>{group.itemIds.length} number layers</small></span>}
                    </div>
                    <button className="layer-group-rename" onClick={() => startRenamingGroup(group)} title="Rename group">✎</button>
                    <button className="layer-group-remove" onClick={() => ungroupLayer(group.id)} title="Ungroup layers">×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="canvas-layer-list">
              <div className="canvas-layer-item background-layer">
                <span className="layer-select-box locked">⌕</span>
                <span className="layer-kind-icon image">▧</span>
                <span className="layer-item-copy"><strong>Background</strong><small>Imported template · locked</small></span>
              </div>
            </div>
          </div>

        </aside>
        {!leftPanelCollapsed && <div className="panel-resize-handle left" onMouseDown={(event) => startPanelResize('left', event)} title={workspaceLocked ? 'Unlock workspace to resize' : 'Drag to resize left panel'} />}

        {/* Center — Canvas Editor */}
        <div
          ref={canvasAreaRef}
          className={`editor-canvas-area ${(panMode || spacePressed) ? 'canvas-pan-ready' : ''} ${isPanning ? 'canvas-panning' : ''}`}
          onMouseDown={handlePanStart}
          onWheel={handleCanvasWheel}
        >
          {canvasSrc && (
            <>
              <button className={`canvas-ruler-corner ${showGrid ? 'active' : ''}`} onMouseDown={(event) => event.stopPropagation()} onClick={() => setShowGrid((visible) => !visible)} title="Toggle grid" aria-label="Toggle grid">▦</button>
              <div className="canvas-ruler canvas-ruler-top" onMouseDown={(event) => startGuideFromRuler(event, 'y')} title="Drag down to add a horizontal guide">
                {canvasSize && Array.from({ length: Math.floor(canvasSize.width / (previewZoom < 60 ? 50 : previewZoom < 125 ? 25 : 10)) + 1 }, (_, index) => index * (previewZoom < 60 ? 50 : previewZoom < 125 ? 25 : 10)).map((value) => (
                  <span key={value} data-label={value % 100 === 0 ? value : undefined} className={value % 100 === 0 ? 'major' : value % 50 === 0 ? 'mid' : 'minor'} style={{ left: `${rulerOrigin.x - CANVAS_RULER_SIZE + value * (previewZoom / 100)}px` }} />
                ))}
              </div>
              <div className="canvas-ruler canvas-ruler-left" onMouseDown={(event) => startGuideFromRuler(event, 'x')} title="Drag right to add a vertical guide">
                {canvasSize && Array.from({ length: Math.floor(canvasSize.height / (previewZoom < 60 ? 50 : previewZoom < 125 ? 25 : 10)) + 1 }, (_, index) => index * (previewZoom < 60 ? 50 : previewZoom < 125 ? 25 : 10)).map((value) => (
                  <span key={value} data-label={value % 100 === 0 ? value : undefined} className={value % 100 === 0 ? 'major' : value % 50 === 0 ? 'mid' : 'minor'} style={{ top: `${rulerOrigin.y - CANVAS_RULER_SIZE + value * (previewZoom / 100)}px` }} />
                ))}
              </div>
            </>
          )}
          {currentAsset ? (
            <div
              ref={canvasZoomStageRef}
              className="canvas-zoom-stage"
              style={{
                width: canvasSize ? `${canvasSize.width * (previewZoom / 100)}px` : '600px',
                height: canvasSize ? `${canvasSize.height * (previewZoom / 100)}px` : '400px',
                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px)`,
              }}
            >
            <div
              ref={canvasContainerRef}
              className="canvas-document"
              style={{
                width: canvasSize ? `${canvasSize.width}px` : '600px',
                height: canvasSize ? `${canvasSize.height}px` : '400px',
                transform: `scale(${previewZoom / 100})`,
              }}
            >
              {/* Receipt / Coupon Base Image */}
              {canvasSrc ? (
                <img
                  src={canvasSrc}
                  alt={currentAsset.originalFilename}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    const area = canvasAreaRef.current;
                    const maxWidth = Math.max(200, (area?.clientWidth || 800) - 48);
                    const maxHeight = Math.max(200, (area?.clientHeight || 700) - 48);
                    const fitScale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
                    setCanvasSize({
                      width: Math.round(image.naturalWidth * fitScale),
                      height: Math.round(image.naturalHeight * fitScale),
                    });
                  }}
                  style={{
                    width: canvasSize ? `${canvasSize.width}px` : 'auto',
                    height: canvasSize ? `${canvasSize.height}px` : 'auto',
                    display: 'block',
                    pointerEvents: 'none',
                  }}
                />
              ) : (
                <div style={{ width: '600px', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', background: 'var(--color-bg-primary)' }}>
                  Loading preview image...
                </div>
              )}

              {canvasSrc && showGrid && (
                <div
                  className="canvas-grid-overlay"
                  style={{
                    opacity: gridOpacity / 100,
                    backgroundSize: `${gridX}px ${gridY}px`,
                  }}
                  aria-hidden="true"
                />
              )}

              {canvasSrc && showNumberFlow && (numberArrangement === 'custom-pattern' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet') && (
                <svg className="number-flow-overlay custom-pattern-connections" width="100%" height="100%" viewBox={`0 0 ${canvasSize?.width || 1} ${canvasSize?.height || 1}`} aria-hidden="true">
                  <defs><marker id="custom-flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#8ab6d1" /></marker></defs>
                  {connectionDrag && (() => {
                    const source = numberItems.find((item) => item.id === connectionDrag.fromId);
                    if (!source) return null;
                    const from = getNumberBoxEdgeAnchor(source, connectionDrag);
                    return <line className="connection-drag-preview" x1={from.x} y1={from.y} x2={connectionDrag.x} y2={connectionDrag.y} markerEnd="url(#custom-flow-arrow)" />;
                  })()}
                  {patternDefinitions.flatMap((definition) => {
                    const members = numberItems.filter((item, index) => (patternGroups[item.id] || String(index + 1)) === definition.id);
                    return members.slice(0, -1).map((item, index) => {
                      const next = members[index + 1];
                      const itemCenter = getNumberBoxCenter(item);
                      const nextCenter = getNumberBoxCenter(next);
                      const key = connectionKey(definition.id, item.id, next.id);
                      const reversed = !!reversedConnections[key];
                      const sourceItem = reversed ? next : item;
                      const targetItem = reversed ? item : next;
                      const sourceCenter = reversed ? nextCenter : itemCenter;
                      const targetCenter = reversed ? itemCenter : nextCenter;
                      const from = getNumberBoxEdgeAnchor(sourceItem, targetCenter);
                      const to = getNumberBoxEdgeAnchor(targetItem, sourceCenter);
                      const isSelected = selectedConnection && connectionKey(selectedConnection.groupId, selectedConnection.fromId, selectedConnection.toId) === key;
                      return <g key={`${definition.id}-${item.id}-${next.id}`} className={isSelected ? 'selected' : ''} onClick={(event) => { event.stopPropagation(); setSelectedConnection({ groupId: definition.id, fromId: sourceItem.id, toId: targetItem.id }); }}><line className="connection-hit-target" x1={from.x} y1={from.y} x2={to.x} y2={to.y} /><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} style={{ stroke: definition.color }} markerEnd="url(#custom-flow-arrow)" /><circle cx={from.x} cy={from.y} r="3.5" fill={definition.color} /><circle cx={to.x} cy={to.y} r="3.5" fill={definition.color} /></g>;
                    });
                  })}
                </svg>
              )}

              {canvasSrc && verticalGuides.map((position, index) => (
                <div
                  key={`vertical-guide-${index}`}
                  className="manual-guide manual-guide-vertical"
                  style={{ left: `${position}px` }}
                  onMouseDown={(e) => { e.stopPropagation(); setDraggingIdx(null); setDraggingGuide({ axis: 'x', index }); }}
                  onDoubleClick={() => setVerticalGuides((guides) => guides.filter((_, i) => i !== index))}
                  title={`Vertical guide ${index + 1}: ${Math.round(position)}px. Drag to move; double-click to remove.`}
                >
                  <span>V{index + 1}</span>
                </div>
              ))}

              {canvasSrc && horizontalGuides.map((position, index) => (
                <div
                  key={`horizontal-guide-${index}`}
                  className="manual-guide manual-guide-horizontal"
                  style={{ top: `${position}px` }}
                  onMouseDown={(e) => { e.stopPropagation(); setDraggingIdx(null); setDraggingGuide({ axis: 'y', index }); }}
                  onDoubleClick={() => setHorizontalGuides((guides) => guides.filter((_, i) => i !== index))}
                  title={`Horizontal guide ${index + 1}: ${Math.round(position)}px. Drag to move; double-click to remove.`}
                >
                  <span>H{index + 1}</span>
                </div>
              ))}

              {/* Render ALL Number Overlay Positions on Canvas */}
              {numberItems.map((item, idx) => {
                const isSelected = selectedIndex === idx;
                const isCurrentlyDragging = draggingIdx === idx;
                const displayVal = previewSheetNumbers[idx] || '';
                const rot = item.rotation ?? 0;

                return (
                  <div
                    key={item.id || idx}
                    data-number-item-id={item.id}
                    onMouseDown={(e) => handleMouseDown(e, idx)}
                    style={{
                      position: 'absolute',
                      left: `${item.x}px`,
                      top: `${item.y}px`,
                      width: `${item.width}px`,
                      minHeight: `${item.height}px`,
                      boxSizing: 'border-box',
                      transform: `rotate(${rot}deg)`,
                      transformOrigin: 'left top',
                      cursor: isCurrentlyDragging ? 'grabbing' : 'grab',
                      padding: '2px 6px',
                      border: `1px ${isSelected ? 'solid var(--color-accent)' : 'dashed rgba(111, 165, 200, 0.62)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'rgba(52, 126, 174, 0.13)' : 'rgba(111, 165, 200, 0.04)',
                      boxShadow: isSelected ? '0 0 0 1px rgba(111, 165, 200, 0.32)' : 'none',
                      fontFamily: item.fontFamily || 'Inter',
                      fontSize: `${item.fontSize || 16}px`,
                      fontWeight: item.fontStyle?.includes('bold') ? 'bold' : 'normal',
                      fontStyle: item.fontStyle?.includes('italic') ? 'italic' : 'normal',
                      lineHeight: 1.5,
                      color: item.fontColor || '#111827',
                      textAlign: (item.alignment as any) || 'left',
                      whiteSpace: 'nowrap',
                      zIndex: isSelected ? 20 : 10,
                      transition: isCurrentlyDragging ? 'none' : 'transform 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    {displayVal}
                    <div
                      style={{
                        position: 'absolute',
                        top: '-18px',
                        left: '0',
                        fontSize: '9px',
                        fontFamily: 'sans-serif',
                        background: isSelected ? 'var(--color-accent)' : '#3f3f3f',
                        color: '#fff',
                        padding: '1px 5px',
                        borderRadius: '2px',
                        pointerEvents: 'none',
                      }}
                    >
                      #{idx + 1} ({rot}°)
                    </div>
                    {(numberArrangement === 'custom-pattern' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet') && isSelected && (
                      <button
                        className="number-connection-handle"
                        onMouseDown={(event) => startConnectionDrag(event, item)}
                        title="Drag onto another number box to connect"
                        aria-label={`Connect position ${idx + 1}`}
                      >
                        ↗
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          ) : (
            <div className="editor-canvas-placeholder">
              <span className="editor-canvas-placeholder-icon">📋</span>
              <span className="editor-canvas-placeholder-text">Receipt / Coupon Canvas</span>
              <span className="editor-canvas-placeholder-hint">
                Import a PDF or image file (PNG, JPG, SVG, WebP) to place it on the canvas.
              </span>
              <button className="btn btn-primary" onClick={handleImportImage}>
                Import Image
              </button>
            </div>
          )}
          {currentAsset && (
            <div className="canvas-zoom-indicator">Preview {previewZoom}%</div>
          )}
          {currentAsset && exportPageCount > 0 && showSheetPreview && (
            <div className="sheet-preview-nav">
              <button onClick={() => setPreviewSheet(0)} disabled={safePreviewSheet === 0} title="First sheet" aria-label="First sheet">«</button>
              <button onClick={() => setPreviewSheet((page) => Math.max(0, page - 1))} disabled={safePreviewSheet === 0}>‹</button>
              <div><span>Sheet preview</span><strong>{safePreviewSheet + 1} / {exportPageCount}</strong></div>
              <button onClick={() => setPreviewSheet((page) => Math.min(exportPageCount - 1, page + 1))} disabled={safePreviewSheet >= exportPageCount - 1}>›</button>
              <button onClick={() => setPreviewSheet(exportPageCount - 1)} disabled={safePreviewSheet >= exportPageCount - 1} title="Last sheet" aria-label="Last sheet">»</button>
            </div>
          )}
        </div>

        {/* Right Panel — Properties & Numbering Setup */}
        {!rightPanelCollapsed && <div className="panel-resize-handle right" onMouseDown={(event) => startPanelResize('right', event)} title={workspaceLocked ? 'Unlock workspace to resize' : 'Drag to resize right panel'} />}
        <aside className={`editor-panel-right ${rightPanelCollapsed ? 'panel-collapsed' : ''}`} style={{ width: rightPanelCollapsed ? 34 : rightPanelWidth }}>
          <div className="panel-dock-controls right">
            <button onClick={() => !workspaceLocked && setRightPanelCollapsed((collapsed) => !collapsed)} disabled={workspaceLocked} title={rightPanelCollapsed ? 'Expand right panel' : 'Collapse right panel'}>{rightPanelCollapsed ? '‹' : '›'}</button>
            {!rightPanelCollapsed && <span>Properties</span>}
          </div>
          <div className="editor-properties-scroll">
          <NumberingPanel
            projectId={activeProject.id}
            numberSettings={numberSettings}
            numberItems={numberItems}
            numberGroupKeys={customPatternKeys}
            previewNumbers={previewSheetNumbers}
            numberPositionsTarget={numberPositionsTarget}
            selectedIndex={selectedIndex}
            onSelectIndex={(idx) => {
              setSelectedIndex(idx);
              const item = numberItems[idx];
              const activeGroup = layerGroups.find((group) => group.id === activeGroupId && group.itemIds.includes(item?.id));
              if (!activeGroup && item) {
                setActiveGroupId(null);
                setSelectedLayerIds([item.id]);
              }
            }}
            onAddNumberItem={handleAddNumberItem}
            onDuplicateNumber={duplicateNumberPosition}
            onLinkToSelected={linkNumberPositionToSelected}
            onRemoveNumberItem={handleRemoveNumberItem}
            onReceiptsPerSheetChange={setReceiptsPerSheet}
            onSettingsChange={(newSettings) => {
              if (numberSettings && numberSettings.mode === newSettings.mode && numberSettings.startNumber === newSettings.startNumber && numberSettings.endNumber === newSettings.endNumber && numberSettings.step === newSettings.step && numberSettings.padding === newSettings.padding && numberSettings.prefix === newSettings.prefix && numberSettings.suffix === newSettings.suffix) return;
              setNumberSettings(newSettings);
              if (settingsSaveTimer.current !== null) window.clearTimeout(settingsSaveTimer.current);
              settingsSaveTimer.current = window.setTimeout(() => {
                api.saveNumberSettings(newSettings).catch((err) => console.error('Failed to save number settings:', err));
              }, 250);
            }}
            onItemChange={handleNumberItemChange}
          />
          <div ref={setNumberFlowTarget} className="number-flow-property-target" />
          </div>
          {!rightPanelCollapsed && <button className="export-toolbar-button export-panel-button" onClick={() => setShowExportDialog(true)} disabled={!currentAsset} title="Open PDF export settings (Ctrl/Command + Alt/Option + Shift + W)">
            <span className="export-toolbar-icon">⇩</span>
            <span className="export-toolbar-copy"><strong>Export PDF</strong><small>{currentAsset ? `${exportPageCount} ${exportPageCount === 1 ? 'page' : 'pages'}` : 'Import a design first'}</small></span>
            <kbd>⌘⇧⌥W</kbd>
          </button>}
        </aside>
      </div>
    </div>
  );
}
