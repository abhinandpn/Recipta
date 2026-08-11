import type { NumberItem } from '../types';
import { createNumberLayoutPlan, type NumberArrangement } from './numberLayout';

export interface PdfExportOptions {
  imageSource: string;
  canvasWidth: number;
  canvasHeight: number;
  numbers: string[];
  /** Optional precomputed values for every position on every PDF page. */
  pageNumbers?: string[][];
  positions: NumberItem[];
  pageWidthPoints: number;
  pageHeightPoints: number;
  quality: number;
  arrangement: NumberArrangement;
  patternGroups?: string[];
  includeBackground: boolean;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the template image for export.'));
    image.src = source;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Unable to render a PDF page.'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', quality);
  });
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function join(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function createPdf(pageImages: Uint8Array[], pixelWidth: number, pixelHeight: number, pageWidth: number, pageHeight: number): Uint8Array {
  const pageCount = pageImages.length;
  const objectCount = 2 + pageCount * 3;
  const objects = new Map<number, Uint8Array>();
  const pageIds = pageImages.map((_, index) => 3 + index * 3);
  objects.set(1, encode('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(2, encode(`<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`));

  pageImages.forEach((jpeg, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const content = encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
    objects.set(pageId, encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    objects.set(contentId, join([encode(`<< /Length ${content.length} >>\nstream\n`), content, encode('endstream')]));
    objects.set(imageId, join([
      encode(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      encode('\nendstream'),
    ]));
  });

  const chunks: Uint8Array[] = [encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let byteOffset = chunks[0].length;
  for (let id = 1; id <= objectCount; id++) {
    const object = join([encode(`${id} 0 obj\n`), objects.get(id)!, encode('\nendobj\n')]);
    offsets[id] = byteOffset;
    chunks.push(object);
    byteOffset += object.length;
  }
  const xrefOffset = byteOffset;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encode(xref));
  return join(chunks);
}

export async function generateNumberedPdf(options: PdfExportOptions, onProgress?: (completed: number, total: number) => void): Promise<Uint8Array> {
  if (!options.positions.length) throw new Error('Add at least one number position before exporting.');
  if (!options.numbers.length) throw new Error('The selected number sequence is empty.');

  const background = await loadImage(options.imageSource);
  // Wait for browser fonts before measuring/drawing. Without this, export can
  // silently use a fallback font with different ascent and width metrics.
  await Promise.all(options.positions.map((position) => {
    const weight = position.fontStyle.includes('bold') ? '700' : '400';
    const style = position.fontStyle.includes('italic') ? 'italic' : 'normal';
    return document.fonts.load(`${style} ${weight} ${position.fontSize}px "${position.fontFamily}"`);
  }));
  const exportScale = Math.min(3, Math.max(1, background.naturalWidth / options.canvasWidth));
  const width = Math.round(options.canvasWidth * exportScale);
  const height = Math.round(options.canvasHeight * exportScale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable.');

  const layout = createNumberLayoutPlan(options.numbers.length, options.positions.length, options.arrangement, options.patternGroups);
  const pageCount = options.pageNumbers?.length ?? layout.pageCount;
  const pages: Uint8Array[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    context.clearRect(0, 0, width, height);
    if (options.includeBackground) {
      context.drawImage(background, 0, 0, width, height);
    } else {
      // PDF pages cannot retain canvas transparency when encoded as JPEG.
      // A clean white page is appropriate for overprinting preprinted stock.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    options.positions.forEach((position, positionIndex) => {
      const number = options.pageNumbers
        ? options.pageNumbers[pageIndex]?.[positionIndex]
        : options.numbers[layout.numberIndexFor(pageIndex, positionIndex)];
      if (number === undefined || !position.isVisible) return;
      const fontSize = position.fontSize * exportScale;
      const fontWeight = position.fontStyle.includes('bold') ? '700' : '400';
      const fontStyle = position.fontStyle.includes('italic') ? 'italic' : 'normal';
      context.save();
      context.translate(position.x * exportScale, position.y * exportScale);
      context.rotate((position.rotation * Math.PI) / 180);
      context.font = `${fontStyle} ${fontWeight} ${fontSize}px "${position.fontFamily}", sans-serif`;
      context.fillStyle = position.fontColor;
      // Match the editor overlay's CSS box model:
      // 2px border + 2px vertical padding + a 1.5 line-height text line.
      // Drawing on the alphabetic baseline avoids the inconsistent Canvas
      // "top" baseline that previously placed exported text too high.
      context.textBaseline = 'alphabetic';
      context.textAlign = position.alignment as CanvasTextAlign;
      const metrics = context.measureText(number);
      const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
      const lineHeight = fontSize * 1.5;
      const glyphHeight = (metrics.actualBoundingBoxAscent || fontSize * 0.8) + (metrics.actualBoundingBoxDescent || fontSize * 0.2);
      const baselineY = (4 * exportScale) + Math.max(0, (lineHeight - glyphHeight) / 2) + ascent;
      const horizontalInset = 8 * exportScale;
      const textX = position.alignment === 'center'
        ? (position.width * exportScale) / 2
        : position.alignment === 'right'
          ? (position.width * exportScale) - horizontalInset
          : horizontalInset;
      context.fillText(number, textX, baselineY);
      context.restore();
    });
    pages.push(await canvasToJpeg(canvas, options.quality));
    onProgress?.(pageIndex + 1, pageCount);
  }
  return createPdf(pages, width, height, options.pageWidthPoints, options.pageHeightPoints);
}
