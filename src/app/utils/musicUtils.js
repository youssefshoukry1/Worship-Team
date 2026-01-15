
// Basic musical constants
const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const FLATS = ['Db', 'Eb', 'Gb', 'Ab', 'Bb'];
const SHARPS = ['C#', 'D#', 'F#', 'G#', 'A#'];

// Mapping for normalization (e.g., handling Db vs C#)
const NOTE_MAP = {
    'Cb': 'B', 'Db': 'C#', 'Eb': 'Eb', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'Bb',
    'C#': 'C#', 'D#': 'Eb', 'F#': 'F#', 'G#': 'G#', 'A#': 'Bb'
};

// Helper to normalize note name (handling sharps/flats preference typically, but here we simplify)
// We will primarily use the NOTES array for index calculation.
const normalizeNote = (note) => {
    if (!note) return null;
    const n = note.trim();
    // Special handling for German H -> B, B -> Bb if standard is English, 
    // but the prompt asked for "A not H" implies standard notation. 
    // Usually H is B, and B is Bb in German. 
    // Prompt says "change G# to A NOT H". This confirms they want standard A, A#, B, C...
    // We will assume input is standard or close to it.

    // Check direct map first
    if (NOTE_MAP[n]) return NOTE_MAP[n];

    // Check if it exists in base notes
    if (NOTES.includes(n)) return n;

    return n; // Return original if unknown (e.g., 'm', '7' suffixes should be stripped before this)
};

const getNoteIndex = (note) => {
    const normalized = normalizeNote(note);
    if (!normalized) return -1;
    // Find index in NOTES. 'Eb' is at index 3, 'C#' at 1.
    // We need to handle aliases.
    // Let's make a robust finder.
    const aliases = [
        ['C', 'B#'],
        ['C#', 'Db'],
        ['D'],
        ['Eb', 'D#'],
        ['E', 'Fb'],
        ['F', 'E#'],
        ['F#', 'Gb'],
        ['G'],
        ['G#', 'Ab'],
        ['A'],
        ['Bb', 'A#'],
        ['B', 'Cb']
    ];

    return aliases.findIndex(group => group.includes(note));
};

export const transposeNote = (note, semitones) => {
    if (!note) return note;

    // Regex to separate root note from suffix (minor, 7, etc)
    // Matches A-G, optional # or b.
    const match = note.match(/^([A-Ga-g])(#|b)?(.*)$/);
    if (!match) return note;

    let root = match[1].toUpperCase() + (match[2] || '');
    const suffix = match[3];

    let idx = getNoteIndex(root);
    if (idx === -1) return note;

    let newIdx = (idx + semitones) % 12;
    if (newIdx < 0) newIdx += 12;

    const newRoot = NOTES[newIdx];
    return newRoot + suffix;
};

export const transposeScale = (scale, semitones) => {
    return transposeNote(scale, semitones);
};

export const transposeChords = (chordsStr, semitones) => {
    if (!chordsStr) return '';
    // Split by commas or spaces, preserve separators if possible or just rebuild
    // Simple split by regex finding everything that looks like a chord?
    // User input is "G, C, D, Em"

    // Strategy: Split by common separators, transpose parts, join back.
    // But we want to preserve exact formatting if possible. 
    // Let's use replace with a callback function.

    // Pattern: [A-G](#|b)?(m|maj|dim|aug|sus|add|7|9|11|13)*
    // We can just iterate the string.

    const parts = chordsStr.split(/([,\s]+)/); // Split keeping delimiters

    const transposedParts = parts.map(part => {
        if (!part.trim() || /^[,\s]+$/.test(part)) return part;
        return transposeNote(part, semitones);
    });

    return transposedParts.join('');
};
