import React, { useState, useEffect } from 'react';
import type { NumberSettings, ManualNumber, NumberItem, ValidationResult } from '../../types';
import * as api from '../../services/api';

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
  manualNumbers: ManualNumber[];
  numberItems: NumberItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onAddNumberItem: () => void;
  onRemoveNumberItem: (index: number) => void;
  onSettingsChange: (settings: NumberSettings) => void;
  onManualNumbersChange: (numbers: string[]) => void;
  onItemChange: (index: number, item: NumberItem) => void;
}

export function NumberingPanel({
  projectId,
  numberSettings,
  manualNumbers,
  numberItems,
  selectedIndex,
  onSelectIndex,
  onAddNumberItem,
  onRemoveNumberItem,
  onSettingsChange,
  onManualNumbersChange,
  onItemChange,
}: NumberingPanelProps) {
  // Local state for auto sequence settings
  const [mode, setMode] = useState<'auto' | 'manual'>(numberSettings?.mode || 'auto');
  const [startNumber, setStartNumber] = useState(numberSettings?.startNumber ?? 1);
  const [endNumber, setEndNumber] = useState(numberSettings?.endNumber ?? 100);
  const [step, setStep] = useState(numberSettings?.step ?? 1);
  const [padding, setPadding] = useState(numberSettings?.padding ?? 4);
  const [prefix, setPrefix] = useState(numberSettings?.prefix || '');
  const [suffix, setSuffix] = useState(numberSettings?.suffix || '');
  const [showAffixes, setShowAffixes] = useState(Boolean(numberSettings?.prefix || numberSettings?.suffix));
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const fontMenuRef = React.useRef<HTMLDivElement>(null);

  // Local state for manual numbers text
  const [manualText, setManualText] = useState(
    manualNumbers.map((m) => m.numberValue).join('\n')
  );
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Active selected item for editing
  const activeItem = numberItems[selectedIndex] || numberItems[0];

  // Local controls for the active selected item
  const [fontFamily, setFontFamily] = useState(activeItem?.fontFamily || 'Inter');
  const [fontSize, setFontSize] = useState(activeItem?.fontSize ?? 16);
  const [fontStyle, setFontStyle] = useState(activeItem?.fontStyle || 'bold');
  const [fontColor, setFontColor] = useState(activeItem?.fontColor || '#111827');
  const [alignment, setAlignment] = useState(activeItem?.alignment || 'left');
  const [posX, setPosX] = useState(activeItem?.x ?? 50);
  const [posY, setPosY] = useState(activeItem?.y ?? 50);
  const [rotation, setRotation] = useState(activeItem?.rotation ?? 0);

  // Sync state when active selected item changes
  useEffect(() => {
    if (activeItem) {
      setFontFamily(activeItem.fontFamily || 'Inter');
      setFontSize(activeItem.fontSize ?? 16);
      setFontStyle(activeItem.fontStyle || 'bold');
      setFontColor(activeItem.fontColor || '#111827');
      setAlignment(activeItem.alignment || 'left');
      setPosX(activeItem.x ?? 50);
      setPosY(activeItem.y ?? 50);
      setRotation(activeItem.rotation ?? 0);
    }
  }, [
    selectedIndex,
    activeItem?.id,
    activeItem?.x,
    activeItem?.y,
    activeItem?.rotation,
    activeItem?.fontFamily,
    activeItem?.fontSize,
    activeItem?.fontStyle,
    activeItem?.fontColor,
    activeItem?.alignment,
  ]);

  // Sample number preview
  const sampleNumber =
    mode === 'auto'
      ? `${prefix}${String(startNumber).padStart(padding, '0')}${suffix}`
      : manualText.split('\n')[0] || `${prefix}0001${suffix}`;

  // Update settings when sequence parameters change
  useEffect(() => {
    const updated: NumberSettings = {
      id: numberSettings?.id || 'ns_' + projectId,
      projectId,
      mode,
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
  }, [mode, startNumber, endNumber, step, padding, prefix, suffix]);

  // Update active item properties when form inputs change
  useEffect(() => {
    if (!activeItem) return;
    const updatedItem: NumberItem = {
      ...activeItem,
      numberValue: sampleNumber,
      x: posX,
      y: posY,
      rotation,
      fontFamily,
      fontSize,
      fontStyle,
      fontColor,
      alignment,
    };
    const unchanged =
      activeItem.numberValue === updatedItem.numberValue &&
      activeItem.x === updatedItem.x && activeItem.y === updatedItem.y &&
      activeItem.rotation === updatedItem.rotation &&
      activeItem.fontFamily === updatedItem.fontFamily &&
      activeItem.fontSize === updatedItem.fontSize &&
      activeItem.fontStyle === updatedItem.fontStyle &&
      activeItem.fontColor === updatedItem.fontColor &&
      activeItem.alignment === updatedItem.alignment;
    if (unchanged) return;
    onItemChange(selectedIndex, updatedItem);
  }, [sampleNumber, posX, posY, rotation, fontFamily, fontSize, fontStyle, fontColor, alignment]);

  useEffect(() => {
    if (!fontMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!fontMenuRef.current?.contains(event.target as Node)) setFontMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [fontMenuOpen]);

  // Handle manual text change & validation
  const handleManualTextChange = async (text: string) => {
    setManualText(text);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    onManualNumbersChange(lines);
    const val = await api.validateManualNumbers(lines);
    setValidation(val);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        handleManualTextChange(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="numbering-panel">
      {/* Frequently used position controls stay at the top for quick access. */}
      <div className="panel-section">
        <div className="panel-section-title">Position & Rotation (#{selectedIndex + 1})</div>
        <div className="panel-row">
          <span className="panel-label">X Offset</span>
          <input type="number" className="panel-input-small" value={Math.round(posX)} onChange={(e) => setPosX(Number(e.target.value))} />
          <span className="panel-label" style={{ minWidth: '45px', textAlign: 'right' }}>Y Offset</span>
          <input type="number" className="panel-input-small" value={Math.round(posY)} onChange={(e) => setPosY(Number(e.target.value))} />
        </div>
        <div className="panel-row" style={{ marginTop: '8px' }}>
          <span className="panel-label">Rotation</span>
          <input type="number" className="panel-input-small" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>degrees (°)</span>
        </div>
        <div className="panel-row" style={{ marginTop: '6px' }}>
          <span className="panel-label">Presets</span>
          <div className="editor-tab-group" style={{ flex: 1 }}>
            {[0, 90, 180, 270].map((value) => (
              <button key={value} className={`editor-tab ${(rotation === value || (value === 270 && rotation === -90)) ? 'active' : ''}`} style={{ flex: 1, padding: '2px 4px' }} onClick={() => setRotation(value)}>{value}°</button>
            ))}
          </div>
        </div>
      </div>

      {/* Multiple Number Positions Manager */}
      <div className="panel-section">
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
                <span className="font-mono" style={{ fontSize: 'var(--text-xs)' }}>
                  {item.numberValue || sampleNumber}
                </span>
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
      </div>

      {/* Mode Switcher */}
      <div className="panel-section">
        <div className="panel-section-title">Numbering Mode</div>
        <div className="editor-tab-group" style={{ width: '100%' }}>
          <button
            className={`editor-tab ${mode === 'auto' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
            onClick={() => setMode('auto')}
          >
            Automatic
          </button>
          <button
            className={`editor-tab ${mode === 'manual' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
            onClick={() => setMode('manual')}
          >
            Manual List
          </button>
        </div>
      </div>

      {/* Automatic Mode Options */}
      {mode === 'auto' ? (
        <div className="panel-section">
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

          {/* Sample Preview */}
          <div style={{ marginTop: '12px', background: 'var(--color-bg-primary)', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-border)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Sample Sequence:</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-accent-light)' }}>
              {sampleNumber}, {prefix}{String(startNumber + step).padStart(padding, '0')}{suffix}, {prefix}{String(startNumber + step * 2).padStart(padding, '0')}{suffix}...
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
              Total: {Math.max(0, Math.floor((endNumber - startNumber) / step) + 1)} numbered copies
            </div>
          </div>
        </div>
      ) : (
        /* Manual List Mode Options */
        <div className="panel-section">
          <div className="panel-section-title">Manual Number List</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>
            Enter one number per line or import a TXT/CSV file:
          </div>

          <textarea
            className="input font-mono"
            style={{ height: '120px', resize: 'vertical', fontSize: 'var(--text-xs)' }}
            placeholder={"GC-0001/24\nGC-0005/24\nGC-0010/24"}
            value={manualText}
            onChange={(e) => handleManualTextChange(e.target.value)}
          />

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <label className="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
              📂 Import TXT/CSV
              <input type="file" accept=".txt,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleManualTextChange('')}
            >
              Clear
            </button>
          </div>

          {validation && (
            <div style={{ marginTop: '8px', fontSize: 'var(--text-xs)' }}>
              <span style={{ color: validation.isValid ? 'var(--color-success)' : 'var(--color-error)' }}>
                {validation.validItems} valid numbers
              </span>
              {validation.duplicates.length > 0 && (
                <span style={{ color: 'var(--color-warning)', marginLeft: '8px' }}>
                  ⚠️ {validation.duplicates.length} duplicate(s)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Style & Typography for Active Item */}
      <div className="panel-section">
        <div className="panel-section-title">
          Font & Typography (#{selectedIndex + 1})
        </div>

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
      </div>

    </div>
  );
}
