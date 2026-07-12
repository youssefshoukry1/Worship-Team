/**
 * Presentation slide grouping for hymn lyrics.
 * Supports manual line breaks and auto grouping based on estimated screen space.
 */

const DEFAULT_VIEWPORT = { width: 1200, height: 900 };

export function getLyricLines(text) {
  if (!text) return [];
  return text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
}

export function cleanStanzaText(text) {
  return getLyricLines(text).join('\n');
}

/** Migrate legacy blank-line slide splits into slideBreaks + clean text. */
export function normalizeStanzaForEdit(stanza) {
  const base = {
    type: stanza.type || 'verse',
    title: stanza.title || '',
    text: stanza.text || '',
    slideMode: 'manual',
    slideBreaks: Array.isArray(stanza.slideBreaks) ? [...stanza.slideBreaks] : [],
  };

  const hasBlankLineSplits = base.text.includes('\n\n');
  const hasManualBreaks = base.slideBreaks.length > 0;

  if (hasBlankLineSplits && !hasManualBreaks) {
    const blocks = base.text.split(/\n\s*\n/).filter((b) => b.trim() !== '');
    const allLines = [];
    const slideBreaks = [];

    blocks.forEach((block, blockIdx) => {
      const blockLines = getLyricLines(block);
      blockLines.forEach((line, lineIdx) => {
        allLines.push(line);
        if (lineIdx === blockLines.length - 1 && blockIdx < blocks.length - 1) {
          slideBreaks.push(allLines.length - 1);
        }
      });
    });

    return {
      ...base,
      text: allLines.join('\n'),
      slideMode: 'manual',
      slideBreaks,
    };
  }

  const lines = getLyricLines(base.text);
  const validBreaks = base.slideBreaks
    .filter((i) => i >= 0 && i < lines.length - 1)
    .sort((a, b) => a - b);

  return {
    ...base,
    text: lines.join('\n'),
    slideMode: 'manual',
    slideBreaks: validBreaks,
  };
}

export function prepareLyricsForSave(lyrics) {
  if (!Array.isArray(lyrics)) return [];
  return lyrics.map((stanza) => {
    const normalized = normalizeStanzaForEdit(stanza);
    return {
      type: normalized.type,
      title: normalized.title,
      text: normalized.text,
      slideMode: 'manual',
      slideBreaks: normalized.slideBreaks,
    };
  });
}

function estimateFontSize(viewportWidth) {
  return Math.min(90, Math.max(28, viewportWidth * 0.07));
}

function stripChords(line) {
  return line.replace(/\[.*?\]/g, '').trim();
}

function estimateWrappedRows(line, viewportWidth, fontSize) {
  const text = stripChords(line);
  if (!text) return 1;
  const avgCharWidth = fontSize * 0.55;
  const usableWidth = viewportWidth * 0.76;
  const charsPerRow = Math.max(8, Math.floor(usableWidth / avgCharWidth));
  return Math.max(1, Math.ceil(text.length / charsPerRow));
}

export function estimateLineVisualHeight(line, options = {}) {
  const viewportWidth = options.viewportWidth ?? DEFAULT_VIEWPORT.width;
  const showChords = options.showChords !== false;
  const fontSize = estimateFontSize(viewportWidth);
  const rows = estimateWrappedRows(line, viewportWidth, fontSize);
  const hasChords = line.includes('[');
  const lineHeight = fontSize * 1.625;
  const chordExtra = hasChords && showChords ? fontSize * 0.85 + 12 : 0;
  const marginY = hasChords && showChords ? fontSize * 1.4 : fontSize * 0.85;
  const gap = options.lineGap ?? 24;
  return rows * lineHeight + chordExtra + marginY + gap;
}

export function autoGroupLinesIntoSlides(lines, options = {}) {
  if (!lines.length) return [];

  const viewportHeight = options.viewportHeight ?? DEFAULT_VIEWPORT.height;
  const titleHeight = options.titleHeight ?? 72;
  const paddingVertical = options.paddingVertical ?? 140;
  const availableHeight = Math.max(200, viewportHeight - titleHeight - paddingVertical);

  const slides = [];
  let currentLines = [];
  let currentHeight = 0;

  for (const line of lines) {
    const lineHeight = estimateLineVisualHeight(line, options);

    if (currentLines.length > 0 && currentHeight + lineHeight > availableHeight) {
      slides.push(currentLines.join('\n'));
      currentLines = [line];
      currentHeight = lineHeight;
    } else {
      currentLines.push(line);
      currentHeight += lineHeight;
    }
  }

  if (currentLines.length) {
    slides.push(currentLines.join('\n'));
  }

  return slides;
}

export function manualGroupLinesIntoSlides(lines, slideBreaks = []) {
  if (!lines.length) return [];

  const slides = [];
  let currentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') {
      if (currentLines.length > 0) {
        slides.push(currentLines.join('\n'));
        currentLines = [];
      }
    } else {
      currentLines.push(line);
      if (slideBreaks.includes(i)) {
        slides.push(currentLines.join('\n'));
        currentLines = [];
      }
    }
  }

  if (currentLines.length > 0) {
    slides.push(currentLines.join('\n'));
  }

  return slides.filter(Boolean);
}

export function countStanzaSlides(stanza, options = {}) {
  const lines = getLyricLines(stanza.text);
  if (!lines.length) return 0;

  const normalized = normalizeStanzaForEdit(stanza);
  return manualGroupLinesIntoSlides(lines, normalized.slideBreaks).length;
}

function applyChordDisplay(text, showChords) {
  return text.replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '');
}

export function buildStanzaSlides(stanza, options = {}) {
  const showChords = options.showChords !== false;
  const lines = getLyricLines(stanza.text);
  if (!lines.length) return [];

  const useAuto = !!options.isAutoSlide;
  const normalized = normalizeStanzaForEdit(stanza);
  const blocks = useAuto
    ? autoGroupLinesIntoSlides(lines, options)
    : manualGroupLinesIntoSlides(lines, normalized.slideBreaks);

  return blocks.map((block) => applyChordDisplay(block.trim(), showChords));
}

export function buildHymnPresentationSlides(lyrics, options = {}) {
  const showChords = options.showChords !== false;

  if (typeof lyrics === 'string') {
    const hasBlankLines = lyrics.includes('\n\n');
    const blocks = hasBlankLines
      ? lyrics.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
      : autoGroupLinesIntoSlides(getLyricLines(lyrics), options);

    return blocks.map((text, index) => ({
      title: `Part ${index + 1}`,
      type: 'verse',
      text: applyChordDisplay(text, showChords),
    }));
  }

  if (!Array.isArray(lyrics)) return [];

  const isAutoSlideHymn = !options.forceManual && (
    lyrics.length === 1 || lyrics.every((stanza) => stanza.slideMode !== 'manual')
  );

  const slides = [];
  lyrics.forEach((stanza) => {
    buildStanzaSlides(stanza, { ...options, isAutoSlide: isAutoSlideHymn }).forEach((text) => {
      slides.push({
        title: stanza.title,
        type: stanza.type,
        text,
      });
    });
  });

  return slides;
}

export function toggleSlideBreak(slideBreaks, lineIndex, lineCount) {
  if (lineIndex < 0 || lineIndex >= lineCount - 1) return slideBreaks || [];

  const breaks = new Set(slideBreaks || []);
  if (breaks.has(lineIndex)) {
    breaks.delete(lineIndex);
  } else {
    breaks.add(lineIndex);
  }

  return [...breaks].sort((a, b) => a - b);
}

export function sanitizeSlideBreaks(slideBreaks, lineCount) {
  return (slideBreaks || [])
    .filter((i) => i >= 0 && i < lineCount - 1)
    .sort((a, b) => a - b);
}
