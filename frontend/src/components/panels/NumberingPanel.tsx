import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { NumberSettings, NumberItem } from '../../types';

const BASIC_FONTS = [
  'Inter',
  'JetBrains Mono',
  'Arial',
  'Arial Black',
  'Calibri',
  'Segoe UI',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Century Gothic',
  'Palatino Linotype',
  'Lucida Console',
  'Impact',
];

interface NumberingPanelProps {
  projectId: string;
  numberSettings: NumberSettings | null;
  numberItems: NumberItem[];
  numberGroupKeys: string[];
  previewNumbers: string[];
  numberPositionsTarget: HTMLDivElement | null;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onAddNumberItem: () => void;
  onDuplicateNumber: (index: number) => void;
  onLinkToSelected: (index: number) => void;
  onRemoveNumberItem: (index: number) => void;
  onReceiptsPerSheetChange: (count: number) => void;
  onSettingsChange: (settings: NumberSettings) => void;
  onItemChange: (index: number, item: NumberItem) => void;
}

export function NumberingPanel({
  projectId,
  numberSettings,
  numberItems,
  numberGroupKeys,
  previewNumbers,
  numberPositionsTarget,
  selectedIndex,
  onSelectIndex,
  onAddNumberItem,
  onDuplicateNumber,
  onLinkToSelected,
  onRemoveNumberItem,
  onReceiptsPerSheetChange,
  onSettingsChange,
  onItemChange,
}: NumberingPanelProps) {
  // Local state for auto sequence settings
  const [startNumber, setStartNumber] = useState(numberSettings?.startNumber ?? 1);
  const [endNumber, setEndNumber] = useState(numberSettings?.endNumber ?? 100);
  const [step, setStep] = useState(numberSettings?.step ?? 1);
  const [padding, setPadding] = useState(numberSettings?.padding ?? 4);
  const [prefix, setPrefix] = useState(numberSettings?.prefix || '');
  const [suffix, setSuffix] = useState(numberSettings?.suffix || '');
  const [showAffixes, setShowAffixes] = useState(Boolean(numberSettings?.prefix || numberSettings?.suffix));
  const [typographyExpanded, setTypographyExpanded] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [positionMenu, setPositionMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const fontMenuRef = React.useRef<HTMLDivElement>(null);

  // Active selected item for editing
  const activeItem = numberItems[selectedIndex] || numberItems[0];
  const uniqueNumberGroupKeys = [...new Set(numberGroupKeys)];

  // Local controls for the active selected item
  const [fontFamily, setFontFamily] = useState(activeItem?.fontFamily || 'Inter');
  const [fontSize, setFontSize] = useState(activeItem?.fontSize ?? 16);
  const [fontStyle, setFontStyle] = useState(activeItem?.fontStyle || 'bold');
  const [fontColor, setFontColor] = useState(activeItem?.fontColor || '#111827');
  const [alignment, setAlignment] = useState(activeItem?.alignment || 'left');

  // Sync state when active selected item changes
  useEffect(() => {
    if (activeItem) {
      setFontFamily(activeItem.fontFamily || 'Inter');
      setFontSize(activeItem.fontSize ?? 16);
      setFontStyle(activeItem.fontStyle || 'bold');
      setFontColor(activeItem.fontColor || '#111827');
      setAlignment(activeItem.alignment || 'left');
    }
  }, [
    selectedIndex,
    activeItem?.id,
    activeItem?.fontFamily,
    activeItem?.fontSize,
    activeItem?.fontStyle,
    activeItem?.fontColor,
    activeItem?.alignment,
  ]);

  // Sample number preview
  const sampleNumber = `${prefix}${String(startNumber).padStart(padding, '0')}${suffix}`;

  // Update settings when sequence parameters change
  useEffect(() => {
    const updated: NumberSettings = {
      id: numberSettings?.id || 'ns_' + projectId,
      projectId,
      mode: 'auto',
      startNumber,
      endNumber,
      step,
      padding,
      prefix,
      suffix,
      customSequence: '',
      createdAt: numberSettings?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSettingsChange(updated);
  }, [startNumber, endNumber, step, padding, prefix, suffix]);

  // Update active item properties when form inputs change
  useEffect(() => {
    if (!activeItem) return;
    const updatedItem: NumberItem = {
      ...activeItem,
      numberValue: sampleNumber,
      fontFamily,
      fontSize,
      fontStyle,
      fontColor,
      alignment,
    };
    const unchanged =
      activeItem.numberValue === updatedItem.numberValue &&
      activeItem.fontFamily === updatedItem.fontFamily &&
      activeItem.fontSize === updatedItem.fontSize &&
      activeItem.fontStyle === updatedItem.fontStyle &&
      activeItem.fontColor === updatedItem.fontColor &&
      activeItem.alignment === updatedItem.alignment;
    if (unchanged) return;
    onItemChange(selectedIndex, updatedItem);
  }, [sampleNumber, fontFamily, fontSize, fontStyle, fontColor, alignment]);

  useEffect(() => {
    if (!fontMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!fontMenuRef.current?.contains(event.target as Node)) setFontMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [fontMenuOpen]);

  useEffect(() => {
    if (!positionMenu) return;
    const closeMenu = () => setPositionMenu(null);
    window.addEventListener('mousedown', closeMenu);
    return () => window.removeEventListener('mousedown', closeMenu);
  }, [positionMenu]);

  useEffect(() => {
    const toggleTypography = () => setTypographyExpanded((expanded) => {
      if (expanded) setFontMenuOpen(false);
      return !expanded;
    });
    window.addEventListener('recipta:toggle-typography', toggleTypography);
    return () => window.removeEventListener('recipta:toggle-typography', toggleTypography);
  }, []);

  const numberPositionsManager = (
    <div className="panel-section number-positions-section">
        <div className="panel-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Number Positions ({numberItems.length})</span>
          <button className="btn btn-primary btn-sm" style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }} onClick={onAddNumberItem}>
            + Add Position
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          {numberItems.map((item, idx) => (
            <div
              key={item.id || idx}
              onClick={() => onSelectIndex(idx)}
              onContextMenu={(event) => {
                event.preventDefault();
                setPositionMenu({ index: idx, x: event.clientX, y: event.clientY });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                background: selectedIndex === idx ? 'var(--color-accent-subtle)' : 'var(--color-bg-primary)',
                border: `1px solid ${selectedIndex === idx ? 'var(--color-accent)' : 'var(--color-surface-border)'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
                <span style={{ fontWeight: 'bold', color: selectedIndex === idx ? 'var(--color-accent-light)' : 'inherit' }}>
                  #{idx + 1}
                </span>
                <span className="font-mono" style={{ fontSize: 'var(--text-xs)' }} title="Number on the current sheet">{previewNumbers[idx] || '—'}</span>
                {(() => {
                  const groupKey = numberGroupKeys[idx] || String(idx + 1);
                  const sourceIndex = numberGroupKeys.findIndex((key, sourceIdx) => (key || String(sourceIdx + 1)) === groupKey);
                  return sourceIndex !== idx ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-light)' }}>Copy of #{sourceIndex + 1}</span> : null;
                })()}
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  ({item.rotation}°)
                </span>
              </div>

              {numberItems.length > 1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '0 4px', color: 'var(--color-error)', fontSize: '14px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveNumberItem(idx);
                  }}
                  title="Remove this position"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {positionMenu && (
          <div className="number-position-context-menu" style={{ left: positionMenu.x, top: positionMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
            <button onClick={() => { onDuplicateNumber(positionMenu.index); setPositionMenu(null); }}>⧉ Duplicate</button>
            <button disabled={positionMenu.index === selectedIndex} onClick={() => { onLinkToSelected(positionMenu.index); setPositionMenu(null); }}>⌁ Link to selected</button>
            <button className="danger" disabled={numberItems.length <= 1} onClick={() => { onRemoveNumberItem(positionMenu.index); setPositionMenu(null); }}>× Delete</button>
          </div>
        )}
    </div>
  );

  return (
    <div className="numbering-panel">
      {numberPositionsTarget ? createPortal(numberPositionsManager, numberPositionsTarget) : numberPositionsManager}

      {/* Automatic Mode Options */}
      <div className="panel-section sequence-generator-section">
          <div className="panel-section-title">Sequence Generator</div>

          <div className="panel-row">
            <span className="panel-label">Start #</span>
            <input
              type="number"
              className="panel-input-small"
              value={startNumber}
              onChange={(e) => setStartNumber(Number(e.target.value))}
            />
            <span className="panel-label" style={{ minWidth: '45px', textAlign: 'right' }}>End #</span>
            <input
              type="number"
              className="panel-input-small"
              value={endNumber}
              onChange={(e) => setEndNumber(Number(e.target.value))}
            />
          </div>

          <div className="panel-row">
            <span className="panel-label">Receipts / sheet</span>
            <input
              type="number"
              className="panel-input-small"
              min="1"
              max="100"
              value={uniqueNumberGroupKeys.length}
              onChange={(e) => onReceiptsPerSheetChange(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Adds or removes positions</span>
          </div>

          <div className="panel-row">
            <span className="panel-label">Step</span>
            <input
              type="number"
              className="panel-input-small"
              min="1"
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
            />
            <span className="panel-label" style={{ minWidth: '45px', textAlign: 'right' }}>Digits</span>
            <input
              type="number"
              className="panel-input-small"
              min="1"
              max="10"
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
            />
          </div>

          <button className={`sequence-optional-toggle ${showAffixes ? 'open' : ''}`} onClick={() => setShowAffixes((visible) => !visible)} aria-expanded={showAffixes}>
            <span>{showAffixes ? '▾' : '▸'} Optional Prefix &amp; Suffix</span>
            <small>{prefix || suffix ? `${prefix || '—'} 0001 ${suffix || '—'}` : 'Not used'}</small>
          </button>

          {showAffixes && (
            <div className="sequence-optional-fields">
              <div className="panel-row">
                <span className="panel-label">Prefix</span>
                <input type="text" className="panel-input" placeholder="e.g. GC-" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
              </div>
              <div className="panel-row">
                <span className="panel-label">Suffix</span>
                <input type="text" className="panel-input" placeholder="e.g. /24" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
              </div>
              {(prefix || suffix) && <button className="sequence-affix-clear" onClick={() => { setPrefix(''); setSuffix(''); }}>Clear prefix and suffix</button>}
            </div>
          )}

      </div>

      {/* Style & Typography for Active Item */}
      <div className={`panel-section collapsible-panel-section ${typographyExpanded ? 'expanded' : 'collapsed'}`}>
        <button
          className="panel-collapsible-heading"
          onClick={() => {
            setTypographyExpanded((expanded) => !expanded);
            if (typographyExpanded) setFontMenuOpen(false);
          }}
          aria-expanded={typographyExpanded}
        >
          <span className="panel-section-title">Font &amp; Typography (#{selectedIndex + 1})</span>
          <span className="panel-collapse-icon" aria-hidden="true">{typographyExpanded ? '−' : '+'}</span>
        </button>

        {typographyExpanded && <div className="panel-collapsible-content">

        <div className="panel-row">
          <span className="panel-label">Font</span>
          <div className="font-picker" ref={fontMenuRef}>
            <button className="font-picker-trigger" onClick={() => setFontMenuOpen((open) => !open)} aria-expanded={fontMenuOpen} aria-haspopup="listbox">
              <span>{fontFamily}</span><strong style={{ fontFamily }}>Aa 123</strong><i>{fontMenuOpen ? '▴' : '▾'}</i>
            </button>
            {fontMenuOpen && (
              <div className="font-picker-menu" role="listbox" aria-label="Choose font">
                {BASIC_FONTS.map((font) => (
                  <button key={font} className={fontFamily === font ? 'selected' : ''} onClick={() => { setFontFamily(font); setFontMenuOpen(false); }} role="option" aria-selected={fontFamily === font}>
                    <span><b>{fontFamily === font ? '✓' : ''}</b>{font}</span>
                    <strong style={{ fontFamily: font }}>Aa 123</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel-row">
          <span className="panel-label">Size</span>
          <input
            type="number"
            className="panel-input-small"
            min="6"
            max="120"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <span className="panel-label" style={{ minWidth: '45px', textAlign: 'right' }}>Color</span>
          <input
            type="color"
            style={{ width: '32px', height: '26px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            value={fontColor}
            onChange={(e) => setFontColor(e.target.value)}
          />
        </div>

        <div className="panel-row">
          <span className="panel-label">Style</span>
          <select
            className="panel-input"
            value={fontStyle}
            onChange={(e) => setFontStyle(e.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
            <option value="italic">Italic</option>
            <option value="bold-italic">Bold Italic</option>
          </select>
        </div>

        <div className="panel-row">
          <span className="panel-label">Align</span>
          <div className="editor-tab-group" style={{ flex: 1 }}>
            <button
              className={`editor-tab ${alignment === 'left' ? 'active' : ''}`}
              style={{ flex: 1, padding: '2px 4px' }}
              onClick={() => setAlignment('left')}
            >
              Left
            </button>
            <button
              className={`editor-tab ${alignment === 'center' ? 'active' : ''}`}
              style={{ flex: 1, padding: '2px 4px' }}
              onClick={() => setAlignment('center')}
            >
              Center
            </button>
            <button
              className={`editor-tab ${alignment === 'right' ? 'active' : ''}`}
              style={{ flex: 1, padding: '2px 4px' }}
              onClick={() => setAlignment('right')}
            >
              Right
            </button>
          </div>
        </div>
        </div>}
      </div>

    </div>
  );
}
