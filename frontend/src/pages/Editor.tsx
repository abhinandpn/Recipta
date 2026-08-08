import React, { useState, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { NumberingPanel } from '../components/panels/NumberingPanel';
import * as api from '../services/api';
import { generateNumberedPdf } from '../services/pdfExport';
import type { Asset, NumberSettings, ManualNumber, NumberItem } from '../types';
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

const PATTERN_COLORS = ['#62a7d2', '#d18a5b', '#79ad78', '#b285c5', '#c7ae61', '#cf7474', '#6fb8ad', '#9b9bd0'];
const assetPreviewCache = new Map<string, string>();

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
  const { activeProject, activeProjectFull, editorTab, setEditorTab, setError, setIsLoading } = useAppStore();

  const [currentAsset, setCurrentAsset] = useState<Asset | null>(
    activeProjectFull?.assets?.[0] || null
  );

  const [numberSettings, setNumberSettings] = useState<NumberSettings | null>(
    activeProjectFull?.numberSettings || null
  );
  const [manualNumbers, setManualNumbers] = useState<ManualNumber[]>(
    activeProjectFull?.manualNumbers || []
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
  const [previewSheet, setPreviewSheet] = useState(0);
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
  const settingsSaveTimer = useRef<number | null>(null);
  const manualNumbersSaveTimer = useRef<number | null>(null);

  // Grid, snapping, and preview controls are editor-only aids.
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridX, setGridX] = useState(20);
  const [gridY, setGridY] = useState(20);
  const [gridOpacity, setGridOpacity] = useState(35);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [panMode, setPanMode] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [verticalGuides, setVerticalGuides] = useState<number[]>([]);
  const [horizontalGuides, setHorizontalGuides] = useState<number[]>([]);
  const [draggingGuide, setDraggingGuide] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);

  // Dragging state for active selected number overlay
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });
  const groupDragStart = useRef<Record<string, { x: number; y: number }>>({});
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

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
    let cancelled = false;
    async function loadAssetSource() {
      if (!activeProject || !currentAsset) {
        setCanvasSrc('');
        setCanvasSize(null);
        return;
      }

      try {
        setIsLoading(true);
        setCanvasSize(null);
        const cacheKey = `${activeProject.id}:${currentAsset.id}:${currentAsset.storedPath}`;
        const cachedPreview = assetPreviewCache.get(cacheKey);
        if (cachedPreview) {
          if (!cancelled) setCanvasSrc(cachedPreview);
          return;
        }
        // Browser imports are already data URLs; desktop imports are loaded
        // securely from the Go backend.
        const dataUrl = currentAsset.storedPath.startsWith('data:')
          ? currentAsset.storedPath
          : await api.getAssetDataUrl(activeProject.id, currentAsset.id);
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
          const response = await fetch(dataUrl);
          if (!response.ok) {
            throw new Error(`Unable to read PDF (${response.status})`);
          }
          const blob = await response.blob();
          const file = new File([blob], currentAsset.originalFilename, { type: 'application/pdf' });
          const rasterizedUrl = await api.convertPdfToImageDataUrl(file);
          assetPreviewCache.set(cacheKey, rasterizedUrl);
          if (!cancelled) setCanvasSrc(rasterizedUrl);
        } else {
          assetPreviewCache.set(cacheKey, dataUrl);
          if (!cancelled) setCanvasSrc(dataUrl);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load asset preview:', err);
        setCanvasSrc('');
        setError(`Failed to render ${currentAsset.fileType.toUpperCase()} preview: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadAssetSource();
    return () => { cancelled = true; };
  }, [currentAsset, activeProject]);

  React.useLayoutEffect(() => {
    const area = canvasAreaRef.current;
    const documentCanvas = canvasContainerRef.current;
    if (!area || !documentCanvas) return;
    const updateRulerOrigin = () => {
      const areaRect = area.getBoundingClientRect();
      const documentRect = documentCanvas.getBoundingClientRect();
      setRulerOrigin({ x: documentRect.left - areaRect.left, y: documentRect.top - areaRect.top });
    };
    updateRulerOrigin();
    area.addEventListener('scroll', updateRulerOrigin, { passive: true });
    window.addEventListener('resize', updateRulerOrigin);
    return () => {
      area.removeEventListener('scroll', updateRulerOrigin);
      window.removeEventListener('resize', updateRulerOrigin);
    };
  }, [canvasSize, previewZoom, canvasSrc]);

  React.useEffect(() => () => {
    if (connectionDragFrame.current !== null) cancelAnimationFrame(connectionDragFrame.current);
    if (numberDragFrame.current !== null) cancelAnimationFrame(numberDragFrame.current);
    if (settingsSaveTimer.current !== null) window.clearTimeout(settingsSaveTimer.current);
    if (manualNumbersSaveTimer.current !== null) window.clearTimeout(manualNumbersSaveTimer.current);
  }, []);

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
    e.stopPropagation();
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
    setNumberItems((prev) => {
      const draggedItem = prev[draggingIdx];
      if (!draggedItem) return prev;
      const activeGroup = layerGroups.find((group) => group.id === activeGroupId && group.itemIds.includes(draggedItem.id));
      if (!activeGroup) {
        if (draggedItem.x === newX && draggedItem.y === newY) return prev;
        return prev.map((item, index) => index === draggingIdx ? { ...item, x: newX, y: newY } : item);
      }
      const groupDx = newX - dragStart.current.initialX;
      const groupDy = newY - dragStart.current.initialY;
      return prev.map((item) => {
        const start = groupDragStart.current[item.id];
        return start ? { ...item, x: Math.max(0, start.x + groupDx), y: Math.max(0, start.y + groupDy) } : item;
      });
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
      canvasAreaRef.current.scrollLeft = panStart.current.scrollLeft - (e.clientX - panStart.current.x);
      canvasAreaRef.current.scrollTop = panStart.current.scrollTop - (e.clientY - panStart.current.y);
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
      scrollLeft: canvasAreaRef.current.scrollLeft,
      scrollTop: canvasAreaRef.current.scrollTop,
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
    if (numberSettings?.mode === 'manual' && manualNumbers.length > 0) {
      return manualNumbers[0].numberValue || '0001';
    }
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

  const nudgeSelectedNumbers = (dx: number, dy: number) => {
    const ids = selectedLayerIds.length ? selectedLayerIds : [numberItems[selectedIndex]?.id].filter(Boolean) as string[];
    if (!ids.length) return;
    captureUndoState();
    setNumberItems((items) => items.map((item) => ids.includes(item.id) ? { ...item, x: Math.max(0, item.x + dx), y: Math.max(0, item.y + dy) } : item));
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
      if (key === '?' || (event.shiftKey && event.key === '/')) { event.preventDefault(); setShowShortcutsDialog(true); return; }
      if (event.key === 'Escape') { setShowShortcutsDialog(false); setShowExportDialog(false); setSelectedLayerIds([]); setSelectedPatternPositionIds([]); setSelectedConnection(null); return; }
      if (modifier && key === 'd') { event.preventDefault(); duplicateSelectedNumber(); return; }
      if (modifier && key === 'g' && !event.shiftKey) { event.preventDefault(); createLayerGroup(); return; }
      if (modifier && key === 'g' && event.shiftKey) { event.preventDefault(); if (activeGroupId) { captureUndoState(); ungroupLayer(activeGroupId); } return; }
      if (modifier && key === 'e') { event.preventDefault(); if (canvasSrc) setShowExportDialog(true); return; }
      if (modifier && event.key === '=') { event.preventDefault(); changeZoom(previewZoom + 10); return; }
      if (modifier && event.key === '-') { event.preventDefault(); changeZoom(previewZoom - 10); return; }
      if (key === 'g' && !modifier) { event.preventDefault(); setShowGrid((visible) => !visible); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && numberItems.length > 1) { event.preventDefault(); handleRemoveNumberItem(selectedIndex); return; }
      const distance = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeSelectedNumbers(-distance, 0); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSelectedNumbers(distance, 0); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); nudgeSelectedNumbers(0, -distance); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); nudgeSelectedNumbers(0, distance); }
  };

  const exportNumbers = (() => {
    if (numberSettings?.mode === 'manual') return manualNumbers.map((item) => item.numberValue).filter(Boolean);
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
  const uniquePatternKeys = [...new Set(customPatternKeys)];
  const exportPageCount = numberArrangement === 'same-number'
    ? exportNumbers.length
    : Math.ceil(exportNumbers.length / Math.max(1, numberArrangement === 'custom-pattern' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet' ? uniquePatternKeys.length : numberItems.length));
  const safePreviewSheet = Math.min(Math.max(0, previewSheet), Math.max(0, exportPageCount - 1));
  const previewSheetNumbers = numberItems.map((_, index) => {
    const patternIndex = uniquePatternKeys.indexOf(customPatternKeys[index]);
    const numberIndex = numberArrangement === 'same-number'
      ? safePreviewSheet
      : numberArrangement === 'custom-pattern'
        ? safePreviewSheet * uniquePatternKeys.length + patternIndex
      : numberArrangement === 'linked-across-sheet'
        ? safePreviewSheet * uniquePatternKeys.length + patternIndex
      : numberArrangement === 'linked-cut-stack'
        ? safePreviewSheet + patternIndex * exportPageCount
      : numberArrangement === 'cut-stack'
        ? safePreviewSheet + index * exportPageCount
        : safePreviewSheet * numberItems.length + index;
    return exportNumbers[numberIndex] ?? '';
  });
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
      const rangeStart = patternIndex * exportPageCount;
      const rangeEnd = Math.min(exportNumbers.length - 1, rangeStart + exportPageCount - 1);
      return rangeStart < exportNumbers.length ? `Linked · ${exportNumbers[rangeStart]}–${exportNumbers[rangeEnd]}` : 'Empty';
    }
    if (numberArrangement === 'cut-stack') {
      const rangeStart = index * exportPageCount;
      const rangeEnd = Math.min(exportNumbers.length - 1, rangeStart + exportPageCount - 1);
      return rangeStart < exportNumbers.length ? `${exportNumbers[rangeStart]}–${exportNumbers[rangeEnd]}` : 'Empty';
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

  return (
    <div className="editor" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Editor Toolbar — Tab Switcher */}
      <div className="editor-toolbar">
        <div className="editor-tab-group">
          <button
            className={`editor-tab ${editorTab === 'receipt' ? 'active' : ''}`}
            onClick={() => setEditorTab('receipt')}
          >
            Receipt / Coupon
          </button>
          <button
            className={`editor-tab ${editorTab === 'foil' ? 'active' : ''}`}
            onClick={() => setEditorTab('foil')}
          >
            Foil / Emboss / Hot-Stamp
          </button>
        </div>

        <div className="editor-toolbar-divider" />

        <button className="btn btn-ghost btn-sm" onClick={handleImportImage}>
          {currentAsset ? '📷 Change Image' : '📷 Import Image'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleAddNumberItem}>
          + Add Number Position
        </button>
        <button
          className={`btn btn-ghost btn-sm ${showGrid ? 'toolbar-control-active' : ''}`}
          onClick={() => setShowGrid((visible) => !visible)}
          title="Show or hide canvas grid"
        >
          Grid {showGrid ? 'On' : 'Off'}
        </button>
        <button
          className={`btn btn-ghost btn-sm ${panMode ? 'toolbar-control-active' : ''}`}
          onClick={() => setPanMode((enabled) => !enabled)}
          title="Drag the preview to move around. You can also hold Space or use the middle mouse button."
        >
          ✋ Pan {panMode ? 'On' : 'Off'}
        </button>
        <button className="btn btn-primary btn-sm export-toolbar-button" onClick={() => setShowExportDialog(true)} disabled={!currentAsset}>
          <span>⇩</span> Export PDF
        </button>
        <button className="btn btn-ghost btn-sm shortcuts-toolbar-button" onClick={() => setShowShortcutsDialog(true)} title="Keyboard shortcuts (?)">
          ⌨ Shortcuts
        </button>

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
          <button className="zoom-reset" onClick={() => changeZoom(100)} title="Reset preview zoom">Reset</button>
        </div>
      </div>

      {showShortcutsDialog && (
        <div className="dialog-overlay" onClick={() => setShowShortcutsDialog(false)}>
          <div className="dialog shortcuts-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="export-dialog-heading"><div><span className="dashboard-eyebrow">Editor controls</span><h2 className="dialog-title">Keyboard shortcuts</h2></div><button onClick={() => setShowShortcutsDialog(false)} aria-label="Close shortcuts">×</button></div>
            <div className="shortcuts-grid">
              <section><h3>History</h3><div><span>Undo</span><kbd>Ctrl/⌘ Z</kbd></div><div><span>Redo</span><kbd>Ctrl/⌘ Shift Z</kbd></div><div><span>Redo alternative</span><kbd>Ctrl/⌘ Y</kbd></div></section>
              <section><h3>Number layers</h3><div><span>Duplicate linked text</span><kbd>Ctrl/⌘ D</kbd></div><div><span>Delete selected</span><kbd>Delete</kbd></div><div><span>Group layers</span><kbd>Ctrl/⌘ G</kbd></div><div><span>Ungroup</span><kbd>Ctrl/⌘ Shift G</kbd></div></section>
              <section><h3>Position</h3><div><span>Nudge 1 px</span><kbd>Arrow keys</kbd></div><div><span>Nudge 10 px</span><kbd>Shift + Arrow</kbd></div><div><span>Temporary pan</span><kbd>Hold Space</kbd></div></section>
              <section><h3>View &amp; output</h3><div><span>Toggle grid</span><kbd>G</kbd></div><div><span>Zoom in</span><kbd>Ctrl/⌘ +</kbd></div><div><span>Zoom out</span><kbd>Ctrl/⌘ −</kbd></div><div><span>Export settings</span><kbd>Ctrl/⌘ E</kbd></div></section>
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
              <span>Sheet 1: {numberItems.map((_, index) => numberArrangement === 'same-number' ? exportNumbers[0] : numberArrangement === 'custom-pattern' || numberArrangement === 'linked-across-sheet' ? exportNumbers[uniquePatternKeys.indexOf(customPatternKeys[index])] : numberArrangement === 'linked-cut-stack' ? exportNumbers[uniquePatternKeys.indexOf(customPatternKeys[index]) * exportPageCount] : numberArrangement === 'cut-stack' ? exportNumbers[index * exportPageCount] : exportNumbers[index]).filter(Boolean).join(' · ') || 'No numbers'}</span>
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
      <div className="editor-main">
        {/* Left Sidebar — Tools & Layers */}
        <aside className="editor-sidebar-left">
          <div className="panel-section">
            <div className="panel-section-title">Project</div>
            <div className="panel-row">
              <span className="panel-label">Name</span>
              <span className="panel-value">{activeProject.name}</span>
            </div>
            <div className="panel-row">
              <span className="panel-label">Type</span>
              <span className="panel-value">
                {activeProject.type === 'receipt' ? 'Receipt / Coupon' : 'Foil / Emboss'}
              </span>
            </div>
          </div>

          <div className="panel-section number-flow-panel">
            <div className="layer-panel-heading">
              <div className="panel-section-title">Number Flow</div>
              <span>{numberItems.length} steps</span>
            </div>
            <div className="arrangement-selector">
              <button className={numberArrangement === 'across-sheet' ? 'active' : ''} onClick={() => { setNumberArrangement('across-sheet'); setShowNumberFlow(false); setConnectionDrag(null); setPreviewSheet(0); }}>
                <span>1·2·3</span><strong>Across sheet</strong><small>Fill positions, then next sheet</small>
              </button>
              <button className={numberArrangement === 'cut-stack' ? 'active' : ''} onClick={() => { setNumberArrangement('cut-stack'); setShowNumberFlow(false); setConnectionDrag(null); setPreviewSheet(0); }}>
                <span>1│101│201</span><strong>Cut &amp; stack</strong><small>One range per position</small>
              </button>
              <button className={numberArrangement === 'same-number' ? 'active' : ''} onClick={() => { setNumberArrangement('same-number'); setShowNumberFlow(false); setConnectionDrag(null); setPreviewSheet(0); }}>
                <span>1 = 1 = 1</span><strong>Same number</strong><small>Repeat on coupon and stub</small>
              </button>
              <button className={numberArrangement === 'custom-pattern' ? 'active' : ''} onClick={() => { setNumberArrangement('custom-pattern'); setShowNumberFlow(true); setPreviewSheet(0); }}>
                <span>1 = 1 │ 2</span><strong>Custom pattern</strong><small>Choose which positions match</small>
              </button>
              <button className={numberArrangement === 'linked-cut-stack' ? 'active' : ''} onClick={() => { setNumberArrangement('linked-cut-stack'); setShowNumberFlow(false); setPreviewSheet(0); }}>
                <span>1│35│69 + copies</span><strong>Linked cut &amp; stack</strong><small>Cut-stack with duplicate text</small>
              </button>
              <button className={numberArrangement === 'linked-across-sheet' ? 'active' : ''} onClick={() => { setNumberArrangement('linked-across-sheet'); setShowNumberFlow(false); setPreviewSheet(0); }}>
                <span>1│2│3 + copies</span><strong>Linked across sheet</strong><small>Across-sheet with duplicate text</small>
              </button>
            </div>
            <div className="linked-cut-stack-preset">
              <div><strong>3 paired receipts</strong><small>1 ↔ 4 &nbsp;·&nbsp; 2 ↔ 5 &nbsp;·&nbsp; 3 ↔ 6</small></div>
              <div className="linked-preset-actions"><button onClick={() => applyThreePairLinkedPreset('linked-across-sheet')} disabled={numberItems.length < 6}>Across: 1 · 2 · 3</button><button onClick={() => applyThreePairLinkedPreset('linked-cut-stack')} disabled={numberItems.length < 6}>Cut-stack: 1 · 35 · 69</button></div>
              {numberItems.length < 6 && <span>Add or duplicate until there are 6 number layers.</span>}
            </div>
            <div className="three-up-preset">
              <div><span>3-UP</span><p><strong>Receipt Cut &amp; Stack</strong><small>Creates 0001 · 0035 · 0069 for a 1–100 sequence.</small></p></div>
              <button onClick={applyThreeUpCutStackPreset} disabled={numberItems.length < 3}>{numberItems.length > 3 ? `Apply & remove ${numberItems.length - 3} extra` : 'Apply setup'}</button>
            </div>
            {numberArrangement === 'same-number' && (
              <div className="linked-number-notice">
                <span>⌁</span>
                <div><strong>Positions are linked</strong><small>Every position prints the same number. The sequence advances once per sheet.</small></div>
              </div>
            )}
            {(numberArrangement === 'custom-pattern' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet') && (
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
            {(numberArrangement === 'cut-stack' || numberArrangement === 'linked-cut-stack' || numberArrangement === 'linked-across-sheet') && (
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
          </div>

          <div className="panel-section">
            <div className="panel-section-title">Imported Template</div>
            {currentAsset ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                <div style={{ wordBreak: 'break-all', marginBottom: '8px' }}>
                  📄 <strong>{currentAsset.originalFilename}</strong>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                  onClick={handleImportImage}
                >
                  Change Template Image
                </button>
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

          <div className="panel-section">
            <div className="layer-panel-heading">
              <div className="panel-section-title">Layers</div>
              <span>{numberItems.length + 1}</span>
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

            <div className="layer-stack-label">Number positions <span>Shift-click to select multiple</span></div>
            <div className="canvas-layer-list">
              {numberItems.map((item, idx) => {
                const selected = selectedLayerIds.includes(item.id);
                const grouped = layerGroups.some((group) => group.itemIds.includes(item.id));
                return (
                  <button
                    key={item.id || idx}
                    className={`canvas-layer-item ${selected ? 'selected' : ''}`}
                    onClick={(event) => handleLayerSelect(event, idx)}
                  >
                    <span className={`layer-select-box ${selected ? 'checked' : ''}`}>{selected ? '✓' : ''}</span>
                    <span className="layer-kind-icon">#</span>
                    <span className="layer-item-copy">
                      <strong>Position #{idx + 1}</strong>
                      <small>{Math.round(item.x)}, {Math.round(item.y)} · {item.rotation}°</small>
                    </span>
                    {grouped && <span className="layer-group-badge">Grouped</span>}
                  </button>
                );
              })}
              <div className="canvas-layer-item background-layer">
                <span className="layer-select-box locked">⌕</span>
                <span className="layer-kind-icon image">▧</span>
                <span className="layer-item-copy"><strong>Background</strong><small>Imported template · locked</small></span>
              </div>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-title">Grid &amp; Snapping</div>
            <label className="grid-toggle-row">
              <span>Show grid lines</span>
              <span className="toggle-switch">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                <span className="toggle-switch-track"><span /></span>
              </span>
            </label>
            <label className="grid-toggle-row">
              <span>Snap positions</span>
              <span className="toggle-switch">
                <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
                <span className="toggle-switch-track"><span /></span>
              </span>
            </label>
            <div className="grid-settings-row">
              <label>
                <span>Horizontal</span>
                <input type="number" min="2" max="500" value={gridX} onChange={(e) => setGridX(Math.max(2, Number(e.target.value) || 2))} />
              </label>
              <label>
                <span>Vertical</span>
                <input type="number" min="2" max="500" value={gridY} onChange={(e) => setGridY(Math.max(2, Number(e.target.value) || 2))} />
              </label>
            </div>
            <label className="grid-opacity-row">
              <span>Grid opacity</span>
              <span>{gridOpacity}%</span>
              <input type="range" min="10" max="90" step="5" value={gridOpacity} onChange={(e) => setGridOpacity(Number(e.target.value))} />
            </label>
            <div className="ruler-scale-summary"><span>Ruler scale</span><strong>Pixels · {previewZoom}% zoom</strong></div>
            <div className="grid-settings-hint">Spacing uses canvas pixels. Enable snapping to align number positions automatically.</div>

            <div className="manual-guides-header photoshop-guides-header">
              <span>Ruler guides</span>
              <span className="guide-count">{verticalGuides.length + horizontalGuides.length}</span>
              {(verticalGuides.length > 0 || horizontalGuides.length > 0) && (
                <button onClick={() => { setVerticalGuides([]); setHorizontalGuides([]); }}>Clear all</button>
              )}
            </div>
            <div className="ruler-guide-help">
              <div><span className="ruler-help-icon top">↧</span><p><strong>Horizontal guide</strong>Drag down from the top ruler</p></div>
              <div><span className="ruler-help-icon side">↦</span><p><strong>Vertical guide</strong>Drag right from the left ruler</p></div>
            </div>
            <div className="guide-delete-help">To delete a guide, drag it back outside the document or double-click it.</div>
          </div>

          <div className="panel-section">
            <div className="panel-section-title">Preview Zoom</div>
            <div className="preview-zoom-value">{previewZoom}%</div>
            <input
              className="preview-zoom-slider"
              type="range"
              min="25"
              max="300"
              step="5"
              value={previewZoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
            />
            <div className="preview-zoom-presets">
              {[50, 100, 150, 200].map((value) => (
                <button key={value} className={previewZoom === value ? 'active' : ''} onClick={() => changeZoom(value)}>{value}%</button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center — Canvas Editor */}
        <div
          ref={canvasAreaRef}
          className={`editor-canvas-area ${(panMode || spacePressed) ? 'canvas-pan-ready' : ''} ${isPanning ? 'canvas-panning' : ''}`}
          onMouseDown={handlePanStart}
          onWheel={handleCanvasWheel}
        >
          {canvasSrc && (
            <>
              <div className="canvas-ruler-corner" title="Ruler origin" />
              <div className="canvas-ruler canvas-ruler-top" onMouseDown={(event) => startGuideFromRuler(event, 'y')} title="Drag down to add a horizontal guide">
                {canvasSize && Array.from({ length: Math.floor(canvasSize.width / 50) + 1 }, (_, index) => index * 50).map((value) => (
                  <span key={value} className={value % 100 === 0 ? 'major' : 'minor'} style={{ left: `${rulerOrigin.x + value * (previewZoom / 100)}px` }}>{value % 100 === 0 ? value : ''}</span>
                ))}
              </div>
              <div className="canvas-ruler canvas-ruler-left" onMouseDown={(event) => startGuideFromRuler(event, 'x')} title="Drag right to add a vertical guide">
                {canvasSize && Array.from({ length: Math.floor(canvasSize.height / 50) + 1 }, (_, index) => index * 50).map((value) => (
                  <span key={value} className={value % 100 === 0 ? 'major' : 'minor'} style={{ top: `${rulerOrigin.y + value * (previewZoom / 100)}px` }}>{value % 100 === 0 ? value : ''}</span>
                ))}
              </div>
            </>
          )}
          {currentAsset ? (
            <div
              className="canvas-zoom-stage"
              style={{
                width: canvasSize ? `${canvasSize.width * (previewZoom / 100)}px` : '600px',
                height: canvasSize ? `${canvasSize.height * (previewZoom / 100)}px` : '400px',
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
              <span className="editor-canvas-placeholder-icon">
                {editorTab === 'receipt' ? '📋' : '✨'}
              </span>
              <span className="editor-canvas-placeholder-text">
                {editorTab === 'receipt'
                  ? 'Receipt / Coupon Canvas'
                  : 'Foil / Emboss / Hot-Stamp Canvas'
                }
              </span>
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
          {currentAsset && exportPageCount > 0 && (
            <div className="sheet-preview-nav">
              <button onClick={() => setPreviewSheet((page) => Math.max(0, page - 1))} disabled={safePreviewSheet === 0}>‹</button>
              <div><span>Sheet preview</span><strong>{safePreviewSheet + 1} / {exportPageCount}</strong></div>
              <button onClick={() => setPreviewSheet((page) => Math.min(exportPageCount - 1, page + 1))} disabled={safePreviewSheet >= exportPageCount - 1}>›</button>
            </div>
          )}
        </div>

        {/* Right Panel — Properties & Numbering Setup */}
        <aside className="editor-panel-right">
          <NumberingPanel
            projectId={activeProject.id}
            numberSettings={numberSettings}
            manualNumbers={manualNumbers}
            numberItems={numberItems}
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
            onRemoveNumberItem={handleRemoveNumberItem}
            onSettingsChange={(newSettings) => {
              if (numberSettings && numberSettings.mode === newSettings.mode && numberSettings.startNumber === newSettings.startNumber && numberSettings.endNumber === newSettings.endNumber && numberSettings.step === newSettings.step && numberSettings.padding === newSettings.padding && numberSettings.prefix === newSettings.prefix && numberSettings.suffix === newSettings.suffix) return;
              setNumberSettings(newSettings);
              if (settingsSaveTimer.current !== null) window.clearTimeout(settingsSaveTimer.current);
              settingsSaveTimer.current = window.setTimeout(() => {
                api.saveNumberSettings(newSettings).catch((err) => console.error('Failed to save number settings:', err));
              }, 250);
            }}
            onManualNumbersChange={(newManualList) => {
              const items: ManualNumber[] = newManualList.map((val, idx) => ({
                id: `mn_${idx}`,
                projectId: activeProject.id,
                sequenceOrder: idx,
                numberValue: val,
                isValid: true,
              }));
              setManualNumbers(items);
              if (manualNumbersSaveTimer.current !== null) window.clearTimeout(manualNumbersSaveTimer.current);
              manualNumbersSaveTimer.current = window.setTimeout(() => {
                api.saveManualNumbers(activeProject.id, newManualList).catch((err) => console.error('Failed to save manual numbers:', err));
              }, 250);
            }}
            onItemChange={(idx, updatedItem) => {
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
            }}
          />
        </aside>
      </div>
    </div>
  );
}
