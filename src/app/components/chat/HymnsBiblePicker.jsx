import React, { useState, useContext, useEffect, useRef } from 'react';
import { Search, Loader2, Folder, BookOpen, Music, ChevronLeft } from 'lucide-react';
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

    const handleSelectBibleHit = async (hit) => {
        // Find full chapter from a search hit
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
            onSelect(item);
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
                                <button 
                                    key={idx}
                                    onClick={() => onSelect(item)}
                                    className="w-full text-right p-3 rounded-xl bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/40 transition-colors flex items-center justify-between"
                                >
                                    <div className="text-sky-400">
                                        {type === 'bible' ? <BookOpen size={16} /> : <Music size={16} />}
                                    </div>
                                    <div className="font-semibold text-sm text-slate-200">
                                        {item.title || item.bookName} {type === 'bible' && item.chapter ? item.chapter : ''}
                                    </div>
                                </button>
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
                                <button 
                                    key={hymn._id}
                                    onClick={() => onSelect(hymn)}
                                    className="w-full text-right p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/40 transition-colors"
                                >
                                    <div className="font-semibold text-sm text-slate-200">{hymn.title}</div>
                                    {hymn.verses && <div className="text-xs text-slate-500 truncate" dir="rtl">{hymn.verses.replace(/\n/g, ' ')}</div>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {tab === 'search' && type === 'bible' && (
                    <div className="flex-1 flex flex-col p-2 gap-2">
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
                                        {searchResults.map((hit, idx) => (
                                            <button 
                                                key={idx}
                                                onClick={() => handleSelectBibleHit(hit)}
                                                className="w-full text-right p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/40 transition-colors"
                                            >
                                                <div className="text-sky-400 font-bold text-[10px]">{hit.bookName} {hit.chapter}:{hit.verseNumber}</div>
                                                <div className="truncate text-slate-300 font-medium text-xs text-right mt-1" dangerouslySetInnerHTML={{ __html: hit.text.replace(/<b[^>]*>(.*?)<\/b>/g, '$1') }} />
                                            </button>
                                        ))}
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
                            <div className="flex-1 flex flex-col">
                                <button onClick={() => setBibleStep('books')} className="mb-2 flex items-center gap-1 text-sky-400 text-xs font-bold p-1">
                                    <ChevronLeft size={14} /> Back to Books
                                </button>
                                <div className="text-center font-bold text-white mb-2">{selectedBook?.bookName}</div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-4 gap-1.5 pr-1">
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
                            <div className="flex-1 flex flex-col">
                                <button onClick={() => setBibleStep('chapters')} className="mb-2 flex items-center gap-1 text-sky-400 text-xs font-bold p-1">
                                    <ChevronLeft size={14} /> Back to Chapters
                                </button>
                                <div className="flex justify-between items-center mb-2 px-2">
                                    <div className="font-bold text-white">{selectedBook?.bookName} {selectedChapter}</div>
                                    <button 
                                        onClick={handleSelectVerse} 
                                        className="bg-sky-500 text-white text-xs px-3 py-1 rounded-full font-bold hover:bg-sky-400"
                                    >
                                        Select All
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1" dir="rtl">
                                    {bibleVerses.map((verse, idx) => (
                                        <div key={idx} className="p-2 rounded-xl bg-slate-800/20 border border-slate-700/30">
                                            <span className="text-sky-400 text-[10px] font-bold ml-1">{verse.verseNumber}</span>
                                            <span className="text-slate-200 text-xs">{verse.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
