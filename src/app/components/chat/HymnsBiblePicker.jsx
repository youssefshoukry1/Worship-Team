import React, { useState, useContext, useEffect, useRef } from 'react';
import { Search, Loader2, Folder, BookOpen, Music, ChevronLeft, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { getApiBaseUrl } from '../../utils/apiBase';
import { HymnsContext } from '../../context/Hymns_Context';

function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function LongPressButton({ onShortPress, onLongPress, className, children, ...props }) {
    const timerRef = useRef(null);
    const isLongPress = useRef(false);

    const start = (e) => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            if (navigator.vibrate) navigator.vibrate(50);
            if (onLongPress) onLongPress(e);
        }, 500);
    };

    const stop = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };

    const handleClick = (e) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!isLongPress.current) {
            if (onShortPress) onShortPress(e);
        }
    };

    return (
        <button
            onMouseDown={start}
            onTouchStart={start}
            onMouseUp={stop}
            onTouchEnd={stop}
            onMouseLeave={stop}
            onTouchCancel={stop}
            onClick={handleClick}
            className={className}
            {...props}
        >
            {children}
        </button>
    );
}

export default function HymnsBiblePicker({ type, onSelect, onClose }) {
    const API_BASE = getApiBaseUrl();
    const BIBLE_API = `${API_BASE}/bible`;
    const { workspace } = useContext(HymnsContext);
    
    const [tab, setTab] = useState('search'); // 'search' or 'workspace'
    
    // Hymns Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Bible State
    const [bibleStep, setBibleStep] = useState('books'); // 'books', 'chapters', 'verses'
    const [bibleBooks, setBibleBooks] = useState([]);
    const [selectedBook, setSelectedBook] = useState(null);
    const [bibleChapters, setBibleChapters] = useState([]);
    const [selectedChapter, setSelectedChapter] = useState(null);
    const [bibleVerses, setBibleVerses] = useState([]);
    
    // Bible Search
    const [bibleSearchQuery, setBibleSearchQuery] = useState('');

    const searchTimerRef = useRef(null);

    useEffect(() => {
        if (type === 'bible' && tab === 'search' && bibleStep === 'books') {
            fetchBooks();
        }
    }, [type, tab, bibleStep]);

    const fetchBooks = async () => {
        try {
            setIsSearching(true);
            const { data } = await axios.get(`${BIBLE_API}/books?lang=arabic`);
            setBibleBooks(data);
        } catch (err) {
            console.error("Failed to fetch books", err);
        } finally {
            setIsSearching(false);
        }
    };

    const fetchChapters = async (book) => {
        try {
            setIsSearching(true);
            setSelectedBook(book);
            setBibleStep('chapters');
            const { data } = await axios.get(`${BIBLE_API}/chapters/${encodeURIComponent(book.bookName)}?lang=arabic&translation=SVD`);
            setBibleChapters(data);
        } catch (err) {
            console.error("Failed to fetch chapters", err);
        } finally {
            setIsSearching(false);
        }
    };

    const fetchVerses = async (chapter) => {
        try {
            setIsSearching(true);
            setSelectedChapter(chapter);
            setBibleStep('verses');
            const { data } = await axios.get(`${BIBLE_API}/verses/${encodeURIComponent(selectedBook.bookName)}/${chapter}?lang=arabic&translation=SVD`);
            setBibleVerses(data);
        } catch (err) {
            console.error("Failed to fetch verses", err);
        } finally {
            setIsSearching(false);
        }
    };

    const [localSelection, setLocalSelection] = useState([]);
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

    const getItemKey = (item) => {
        if (!item) return '';
        if (item.type === 'bible') {
            if (item.verses && item.verses.length === 1) {
                return `bible_${item.bookName}_${item.chapter}_${item.verses[0].verseNumber}`;
            }
            return `bible_${item.bookName}_${item.chapter}`;
        }
        return `hymn_${item._id}`;
    };

    const isSelected = (item) => {
        const key = getItemKey(item);
        return localSelection.some(i => getItemKey(i) === key);
    };

    const handleItemInteraction = (item, isLongPress) => {
        if (isMultiSelectMode) {
            const key = getItemKey(item);
            const exists = localSelection.some(i => getItemKey(i) === key);
            if (exists) {
                const next = localSelection.filter(i => getItemKey(i) !== key);
                setLocalSelection(next);
                if (next.length === 0) setIsMultiSelectMode(false);
            } else {
                setLocalSelection(prev => [...prev, item]);
            }
        } else {
            if (isLongPress) {
                setIsMultiSelectMode(true);
                setLocalSelection([item]);
            } else {
                onSelect(item);
                onClose();
            }
        }
    };

    const handleHymnsSearch = (query) => {
        setSearchQuery(query);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        searchTimerRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                let offlineResults = [];
                try {
                    const localforage = (await import('localforage')).default;
                    const cachedData = await localforage.getItem('taspe7_hymns_json');
                    if (cachedData && Array.isArray(cachedData.data)) {
                        const normalizedQuery = normalizeText(query);
                        const results = cachedData.data.filter(hymn => {
                            const normalizedTitle = normalizeText(hymn.title || '');
                            let lyricsText = '';
                            if (typeof hymn.lyrics === 'string') {
                                lyricsText = hymn.lyrics;
                            } else if (Array.isArray(hymn.lyrics)) {
                                lyricsText = hymn.lyrics.map(l => l.text).join(' ');
                            }
                            const normalizedLyrics = normalizeText(lyricsText);
                            return normalizedTitle.includes(normalizedQuery) || normalizedLyrics.includes(normalizedQuery);
                        });
                        offlineResults = results.slice(0, 15);
                    }
                } catch (e) {
                    console.error("Offline search failed", e);
                }

                if (offlineResults.length > 0) {
                    setSearchResults(offlineResults);
                } else {
                    const { data } = await axios.get(`${API_BASE}/hymns/search?limit=15&q=${encodeURIComponent(query)}`);
                    setSearchResults(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 500);
    };

    const handleBibleSearch = (query) => {
        setBibleSearchQuery(query);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        searchTimerRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const { data } = await axios.get(`${BIBLE_API}/search?q=${encodeURIComponent(query)}&lang=arabic&translation=SVD`);
                setSearchResults(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 500);
    };

    const handleSelectBibleHit = async (hit, isLongPress) => {
        try {
            setIsSearching(true);
            const { data } = await axios.get(`${BIBLE_API}/verses/${encodeURIComponent(hit.bookName)}/${hit.chapter}?lang=arabic`);
            const item = {
                type: 'bible',
                bookName: hit.bookName,
                chapter: hit.chapter,
                verses: data,
                title: `${hit.bookName} ${hit.chapter}`
            };
            handleItemInteraction(item, isLongPress);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectVerse = (verse) => {
        const item = {
            type: 'bible',
            bookName: selectedBook.bookName,
            chapter: selectedChapter,
            verses: bibleVerses,
            title: `${selectedBook.bookName} ${selectedChapter}`
        };
        onSelect(item);
    };

    // Filter Workspace
    const workspaceItems = workspace.filter(item => {
        if (type === 'bible') return item.isBible || item.type === 'bible';
        return !item.isBible && item.type !== 'bible'; // Hymns
    });

    return (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-[calc(100vw-2rem)] sm:w-[350px] max-w-[350px] h-[60vh] max-h-[420px] min-h-[300px] bg-[#131b2e] border border-slate-700/70 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
            <div className="flex border-b border-slate-800 bg-[#0d1322] p-1.5 shrink-0 gap-1">
                <button 
                    onClick={() => setTab('search')} 
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex justify-center items-center gap-1.5 transition-colors ${tab === 'search' ? 'bg-sky-600/30 text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                    <Search size={15} /> Search
                </button>
                <button 
                    onClick={() => setTab('workspace')} 
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex justify-center items-center gap-1.5 transition-colors ${tab === 'workspace' ? 'bg-sky-600/30 text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                    <Folder size={15} /> Workspace
                </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col relative">
                {isSearching && (
                    <div className="absolute inset-0 bg-[#131b2e]/80 flex justify-center items-center z-10">
                        <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                    </div>
                )}

                {tab === 'workspace' && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                        {workspaceItems.length === 0 ? (
                            <div className="text-center text-slate-500 text-xs mt-10">No items in workspace.</div>
                        ) : (
                            workspaceItems.map((item, idx) => (
                                <LongPressButton 
                                    key={idx}
                                    onShortPress={() => handleItemInteraction(item, false)}
                                    onLongPress={() => handleItemInteraction(item, true)}
                                    className={`w-full text-right p-3 rounded-xl transition-colors flex items-center justify-between border ${isSelected(item) ? 'bg-sky-500/20 border-sky-500/50' : 'bg-slate-800/40 hover:bg-slate-700/60 border-slate-700/40'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        {isSelected(item) && <CheckCircle2 className="text-sky-400 shrink-0" size={16} />}
                                        <div className="text-sky-400">
                                            {type === 'bible' ? <BookOpen size={16} /> : <Music size={16} />}
                                        </div>
                                    </div>
                                    <div className="font-semibold text-sm text-slate-200">
                                        {item.title || item.bookName} {type === 'bible' && item.chapter ? item.chapter : ''}
                                    </div>
                                </LongPressButton>
                            ))
                        )}
                    </div>
                )}

                {tab === 'search' && type === 'hymns' && (
                    <div className="flex-1 flex flex-col p-2 gap-2">
                        <div className="relative shrink-0">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleHymnsSearch(e.target.value)}
                                placeholder="Search hymns..."
                                className="w-full bg-[#0d1322] text-white text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-700/60 focus:outline-none focus:border-sky-500/70"
                                dir="rtl"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                            {searchResults.map((hymn) => (
                                <LongPressButton 
                                    key={hymn._id}
                                    onShortPress={() => handleItemInteraction(hymn, false)}
                                    onLongPress={() => handleItemInteraction(hymn, true)}
                                    className={`w-full text-right p-2.5 rounded-xl transition-colors border flex items-center justify-between gap-2 ${isSelected(hymn) ? 'bg-sky-500/20 border-sky-500/50' : 'bg-slate-800/40 hover:bg-slate-700/60 border-slate-700/40'}`}
                                >
                                    {isSelected(hymn) && <CheckCircle2 className="text-sky-400 shrink-0" size={16} />}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm text-slate-200 truncate">{hymn.title}</div>
                                        {hymn.verses && <div className="text-xs text-slate-500 truncate" dir="rtl">{hymn.verses.replace(/\n/g, ' ')}</div>}
                                    </div>
                                </LongPressButton>
                            ))}
                        </div>
                    </div>
                )}

                {tab === 'search' && type === 'bible' && (
                    <div className="flex-1 flex flex-col p-2 gap-2 min-h-0">
                        {bibleStep === 'books' && (
                            <>
                                <div className="relative shrink-0 mb-2">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text"
                                        value={bibleSearchQuery}
                                        onChange={(e) => handleBibleSearch(e.target.value)}
                                        placeholder="Search Bible..."
                                        className="w-full bg-[#0d1322] text-white text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-700/60 focus:outline-none focus:border-sky-500/70"
                                        dir="rtl"
                                    />
                                </div>
                                
                                {bibleSearchQuery ? (
                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                        {searchResults.map((hit, idx) => {
                                            const hitKey = `bible_${hit.bookName}_${hit.chapter}`;
                                            const selected = localSelection.some(i => getItemKey(i) === hitKey);
                                            return (
                                            <LongPressButton 
                                                key={idx}
                                                onShortPress={() => handleSelectBibleHit(hit, false)}
                                                onLongPress={() => handleSelectBibleHit(hit, true)}
                                                className={`w-full text-right p-2.5 rounded-xl transition-colors border flex items-center gap-2 justify-between ${selected ? 'bg-sky-500/20 border-sky-500/50' : 'bg-slate-800/40 hover:bg-slate-700/60 border-slate-700/40'}`}
                                            >
                                                {selected && <CheckCircle2 className="text-sky-400 shrink-0" size={16} />}
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sky-400 font-bold text-[10px]">{hit.bookName} {hit.chapter}:{hit.verseNumber}</div>
                                                    <div className="truncate text-slate-300 font-medium text-xs text-right mt-1" dangerouslySetInnerHTML={{ __html: hit.text.replace(/<b[^>]*>(.*?)<\/b>/g, '$1') }} />
                                                </div>
                                            </LongPressButton>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-1.5 pr-1">
                                        {bibleBooks.map((book) => (
                                            <button
                                                key={book._id || book.bookName}
                                                onClick={() => fetchChapters(book)}
                                                className="p-2 text-xs font-bold text-slate-300 bg-slate-800/40 hover:bg-sky-500/20 border border-slate-700/40 hover:border-sky-500/30 rounded-xl transition-colors"
                                            >
                                                {book.bookName}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                        
                        {bibleStep === 'chapters' && (
                            <div className="flex-1 flex flex-col min-h-0">
                                <button onClick={() => setBibleStep('books')} className="mb-2 shrink-0 flex items-center gap-1 text-sky-400 text-xs font-bold p-1">
                                    <ChevronLeft size={14} /> Back to Books
                                </button>
                                <div className="text-center font-bold text-white mb-2 shrink-0">{selectedBook?.bookName}</div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-4 gap-1.5 pr-1 min-h-0">
                                    {bibleChapters.map((ch) => (
                                        <button
                                            key={ch}
                                            onClick={() => fetchVerses(ch)}
                                            className="p-2 text-sm font-bold text-slate-300 bg-slate-800/40 hover:bg-sky-500/20 border border-slate-700/40 rounded-xl transition-colors"
                                        >
                                            {ch}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {bibleStep === 'verses' && (
                            <div className="flex-1 flex flex-col min-h-0">
                                <button onClick={() => setBibleStep('chapters')} className="mb-2 shrink-0 flex items-center gap-1 text-sky-400 text-xs font-bold p-1">
                                    <ChevronLeft size={14} /> Back to Chapters
                                </button>
                                <div className="flex justify-between items-center mb-2 px-2 shrink-0">
                                    <div className="font-bold text-white">{selectedBook?.bookName} {selectedChapter}</div>
                                    <button 
                                        onClick={() => { handleSelectVerse(); onClose(); }} 
                                        className="bg-sky-500 text-white text-xs px-3 py-1 rounded-full font-bold hover:bg-sky-400"
                                    >
                                        Select All
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-0" dir="rtl">
                                    {bibleVerses.map((verse, idx) => {
                                        const item = {
                                            type: 'bible',
                                            bookName: selectedBook?.bookName,
                                            chapter: selectedChapter,
                                            verses: [verse],
                                            title: `${selectedBook?.bookName} ${selectedChapter}:${verse.verseNumber}`
                                        };
                                        const selected = isSelected(item);
                                        return (
                                            <LongPressButton 
                                                key={idx} 
                                                onShortPress={() => handleItemInteraction(item, false)}
                                                onLongPress={() => handleItemInteraction(item, true)}
                                                className={`w-full text-right p-2 rounded-xl transition-colors border flex items-center justify-between gap-2 block ${selected ? 'bg-sky-500/20 border-sky-500/50' : 'bg-slate-800/20 hover:bg-slate-800/60 border-slate-700/30'}`}
                                            >
                                                {selected && <CheckCircle2 className="text-sky-400 shrink-0" size={14} />}
                                                <div className="flex-1 text-right min-w-0">
                                                    <span className="text-sky-400 text-[10px] font-bold ml-1">{verse.verseNumber}</span>
                                                    <span className="text-slate-200 text-xs">{verse.text}</span>
                                                </div>
                                            </LongPressButton>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Multi-Select Action Bar */}
            {isMultiSelectMode && localSelection.length > 0 && (
                <div className="absolute bottom-4 left-4 right-4 bg-[#0a0f18]/95 backdrop-blur border border-sky-500/30 shadow-xl shadow-sky-900/20 rounded-xl p-3 flex justify-between items-center z-[100] animate-in slide-in-from-bottom-4">
                    <span className="text-slate-200 font-bold text-sm">Selected: <span className="text-sky-400">{localSelection.length}</span></span>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => { setIsMultiSelectMode(false); setLocalSelection([]); }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => {
                                const finalItems = [];
                                const bibleGroups = {};

                                localSelection.forEach(item => {
                                    if (item.type === 'bible') {
                                        const key = `${item.bookName}_${item.chapter}`;
                                        if (!bibleGroups[key]) {
                                            bibleGroups[key] = {
                                                type: 'bible',
                                                bookName: item.bookName,
                                                chapter: item.chapter,
                                                verses: [],
                                            };
                                        }
                                        bibleGroups[key].verses.push(...item.verses);
                                    } else {
                                        finalItems.push(item);
                                    }
                                });

                                Object.values(bibleGroups).forEach(group => {
                                    group.verses.sort((a, b) => {
                                        const numA = parseInt(a.verseNumber, 10);
                                        const numB = parseInt(b.verseNumber, 10);
                                        return (numA || 0) - (numB || 0);
                                    });
                                    
                                    if (group.verses.length === 1) {
                                        group.title = `${group.bookName} ${group.chapter}:${group.verses[0].verseNumber}`;
                                    } else {
                                        const verseNums = group.verses.map(v => v.verseNumber);
                                        const isConsecutive = verseNums.length > 1 && verseNums.every((v, i) => i === 0 || parseInt(v, 10) === parseInt(verseNums[i - 1], 10) + 1);
                                        if (isConsecutive) {
                                            group.title = `${group.bookName} ${group.chapter}:${verseNums[0]}-${verseNums[verseNums.length - 1]}`;
                                        } else {
                                            group.title = `${group.bookName} ${group.chapter}:${verseNums.join(',')}`;
                                        }
                                    }
                                    finalItems.push(group);
                                });

                                finalItems.forEach(i => onSelect(i));
                                onClose();
                            }}
                            className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-xs font-bold hover:bg-sky-400 transition-colors"
                        >
                            Add ({localSelection.length})
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
