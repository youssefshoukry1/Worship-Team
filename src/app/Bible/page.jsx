'use client';

import React, { useState, useEffect, useContext, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, ChevronRight, Search, PlayCircle, Monitor, X, Loader2, BookOpen } from 'lucide-react';
import { useLanguage } from "../context/LanguageContext";
import { UserContext } from '../context/User_Context';
import { usePresentation } from '../hooks/usePresentation';
import { normalizeBibleBooksFromApi } from '../utils/bibleBooks';

const API_ROOT = (process.env.NEXT_PUBLIC_API_URL || 'https://worship-team-api.onrender.com/api').replace(/\/$/, '');
const BASE_URL = `${API_ROOT}/bible`;

function testamentLabel(testament, langIsAr) {
    const isNew = String(testament || '').toLowerCase() === 'new';
    if (langIsAr) return isNew ? 'العهد الجديد' : 'العهد القديم';
    return isNew ? 'New' : 'Old';
}

export default function BiblePage() {
    const { t, language } = useLanguage();
    const { vocalsMode } = useContext(UserContext);
    
    const [books, setBooks] = useState([]);
    const [selectedBook, setSelectedBook] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [selectedChapter, setSelectedChapter] = useState(null);
    const [verses, setVerses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [booksLoading, setBooksLoading] = useState(true);

    // Presentation States
    const [showDataShow, setShowDataShow] = useState(false);
    const [dataShowIndex, setDataShowIndex] = useState(0);
    const [dataShowId, setDataShowId] = useState('');

    useEffect(() => {
        const savedSession = localStorage.getItem('myLivePresentationId');
        if (savedSession) setDataShowId(savedSession);
    }, []);

    const { isConnected, broadcastHymn, broadcastSlide } = usePresentation(
        dataShowId || null,
        'controller'
    );

    // Initial Fetch: Books
    useEffect(() => {
        const fetchBooks = async () => {
            setBooksLoading(true);
            try {
                const res = await axios.get(`${BASE_URL}/books?language=ar`);
                setBooks(normalizeBibleBooksFromApi(res.data));
            } catch (err) {
                console.error("Error fetching books:", err);
                setBooks([]);
            } finally {
                setBooksLoading(false);
            }
        };
        fetchBooks();
    }, []);

    // Fetch Chapters when book is selected
    const handleBookSelect = async (book) => {
        setSelectedBook(book);
        setSelectedChapter(null);
        setVerses([]);
        setLoading(true);
        try {
            const res = await axios.get(`${BASE_URL}/chapters/${encodeURIComponent(book.bookName)}?language=ar`);
            setChapters(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching chapters:", err);
            setLoading(false);
        }
    };

    // Fetch Verses when chapter is selected
    const handleChapterSelect = async (chapter) => {
        setSelectedChapter(chapter);
        setLoading(true);
        try {
            const res = await axios.get(`${BASE_URL}/verses/${encodeURIComponent(selectedBook.bookName)}/${chapter}?language=ar`);
            setVerses(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching verses:", err);
            setLoading(false);
        }
    };

    // Search
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchQuery.trim().length >= 1) {
                setIsSearching(true);
                try {
                    const res = await axios.get(`${BASE_URL}/search?q=${encodeURIComponent(searchQuery)}&language=ar`);
                    setSearchResults(res.data);
                } catch (err) {
                    console.error("Search error:", err);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    // Presentation Broadcast
    useEffect(() => {
        if (showDataShow && dataShowId && verses.length > 0 && isConnected) {
            const bibleTitle = `${selectedBook.bookName} ${selectedChapter}`;
            const slides = verses.map(v => ({
                title: `${selectedBook.bookName} ${selectedChapter}:${v.verseNumber}`,
                type: 'verse',
                text: v.text
            }));
            
            // Re-using the same broadcast logic as hymns
            broadcastHymn({ title: bibleTitle, _id: `bible-${selectedBook.bookName}-${selectedChapter}` }, slides);
            broadcastSlide(dataShowIndex);
        }
    }, [showDataShow, dataShowId, verses, isConnected, dataShowIndex, selectedBook, selectedChapter, broadcastHymn, broadcastSlide]);

    const openPresentation = (index = 0) => {
        setDataShowIndex(index);
        setShowDataShow(true);
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.05 } }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        show: { y: 0, opacity: 1 }
    };

    return (
        <div className="min-h-screen bg-[#0a1020] text-white p-4 sm:p-8 relative overflow-hidden" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(56,189,248,0.12),transparent)] pointer-events-none" />
            <div className="max-w-6xl mx-auto pt-20 relative">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
                    <div className="text-center md:text-start">
                        <h1 className="text-4xl sm:text-5xl font-black bg-linear-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent mb-2">
                            {t("bible")}
                        </h1>
                        <p className="text-gray-400 font-medium text-sm sm:text-base">
                            {selectedBook ? `${selectedBook.bookName} ${selectedChapter ? `· ${t("chapter")} ${selectedChapter}` : ''}` : `${t("selectBook")} · SVD`}
                        </p>
                    </div>

                    {/* Search Bar */}
                    <div className="relative w-full md:w-96 group">
                        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-sky-400/50 group-focus-within:text-sky-400 transition-colors">
                            {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                        </div>
                        <input
                            type="text"
                            placeholder={t("search")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#121a2e]/90 border border-white/10 rounded-2xl py-4 pr-12 pl-6 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500/30 transition-all placeholder:text-gray-500 text-lg shadow-inner shadow-black/20"
                        />
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Sidebar / Book Selection */}
                    {!selectedBook && !searchQuery && (
                        <div className="lg:col-span-12">
                            {booksLoading ? (
                                <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
                                    <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
                                    <span className="text-sm font-medium">{t("searching")}</span>
                                </div>
                            ) : books.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center text-gray-400 max-w-md mx-auto">
                                    <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-40" strokeWidth={1.25} />
                                    <p className="text-sm leading-relaxed">{t("selectBook")} — لا توجد أسفار من الخادم.</p>
                                </div>
                            ) : (
                            <motion.div 
                                variants={containerVariants} 
                                initial="hidden" 
                                animate="show"
                                className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4"
                            >
                                {books.map((book) => (
                                    <motion.button
                                        key={book.bookName}
                                        variants={itemVariants}
                                        onClick={() => handleBookSelect(book)}
                                        className="group relative p-5 sm:p-6 bg-[#121a2e]/80 border border-white/[0.08] rounded-3xl hover:bg-sky-500/10 hover:border-sky-500/35 hover:shadow-lg hover:shadow-sky-500/5 transition-all duration-300 text-center"
                                    >
                                        <div className="mb-3 inline-flex p-3 rounded-2xl bg-sky-500/10 text-sky-400 group-hover:scale-110 transition-transform border border-sky-400/10">
                                            <Book size={22} />
                                        </div>
                                        <h3 className="font-bold text-sm sm:text-base whitespace-nowrap overflow-hidden text-ellipsis">{book.bookName}</h3>
                                        <div className="text-[10px] text-gray-500 font-bold mt-2 tracking-wide">{testamentLabel(book.testament, language === 'ar')}</div>
                                    </motion.button>
                                ))}
                            </motion.div>
                            )}
                        </div>
                    )}

                    {/* Chapter Selection */}
                    {selectedBook && !selectedChapter && !searchQuery && (
                        <div className="lg:col-span-12">
                            <div className="flex items-center gap-4 mb-8">
                                <button onClick={() => setSelectedBook(null)} className="p-2 hover:bg-white/10 rounded-full text-sky-400 transition-colors">
                                    <ChevronRight className={language === 'ar' ? '' : 'rotate-180'} />
                                </button>
                                <h2 className="text-2xl font-bold flex items-center gap-2">
                                    <Book size={24} className="text-sky-400" />
                                    {selectedBook.bookName}
                                </h2>
                            </div>
                            <motion.div 
                                variants={containerVariants} 
                                initial="hidden" 
                                animate="show"
                                className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-3"
                            >
                                {chapters.map((ch) => (
                                    <motion.button
                                        key={ch}
                                        variants={itemVariants}
                                        onClick={() => handleChapterSelect(ch)}
                                        className="p-3 sm:p-4 bg-[#121a2e]/80 border border-white/[0.08] rounded-2xl hover:bg-sky-500/15 hover:border-sky-500/40 transition-all font-bold text-center tabular-nums shadow-sm shadow-black/10"
                                    >
                                        {ch}
                                    </motion.button>
                                ))}
                            </motion.div>
                        </div>
                    )}

                    {/* Verses Display */}
                    {selectedChapter && !searchQuery && (
                        <div className="lg:col-span-12">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setSelectedChapter(null)} className="p-2 hover:bg-white/10 rounded-full text-sky-400 transition-colors">
                                        <ChevronRight className={language === 'ar' ? '' : 'rotate-180'} />
                                    </button>
                                    <h2 className="text-2xl font-bold">
                                        {selectedBook.bookName} {selectedChapter}
                                    </h2>
                                </div>
                                <button 
                                    onClick={() => openPresentation(0)}
                                    className="flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-2xl transition-all shadow-[0_0_20px_rgba(14,165,233,0.3)]"
                                >
                                    <Monitor size={20} />
                                    {t("presentation")}
                                </button>
                            </div>

                            <motion.div 
                                variants={containerVariants} 
                                initial="hidden" 
                                animate="show"
                                className="space-y-6"
                            >
                                {verses.map((v, idx) => (
                                    <motion.div 
                                        key={v._id} 
                                        variants={itemVariants}
                                        className="relative p-6 sm:p-8 bg-[#121a2e]/70 border border-white/[0.08] rounded-3xl hover:border-sky-500/25 hover:bg-[#121a2e] transition-all group shadow-lg shadow-black/20"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="inline-flex px-3 py-1 rounded-xl bg-sky-500/15 text-sky-300 text-xs font-black border border-sky-400/20 tabular-nums">
                                                {v.verseNumber}
                                            </span>
                                            <button 
                                                onClick={() => openPresentation(idx)}
                                                className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-sky-400 transition-all"
                                            >
                                                <PlayCircle size={20} />
                                            </button>
                                        </div>
                                        <p className="text-xl sm:text-2xl leading-relaxed font-bold text-gray-100">
                                            {v.text}
                                        </p>
                                    </motion.div>
                                ))}
                            </motion.div>
                        </div>
                    )}

                    {/* Search Results */}
                    {searchQuery && (
                        <div className="lg:col-span-12">
                            <h2 className="text-lg text-gray-400 mb-6 font-semibold">
                                {isSearching
                                    ? t("searching")
                                    : searchResults.length === 0
                                        ? (language === 'ar' ? 'لا نتائج' : 'No results')
                                        : `${searchResults.length} ${t("resultsFound")}`}
                            </h2>
                            {!isSearching && searchResults.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-[#121a2e]/50 p-10 text-center text-gray-500">
                                    <BookOpen className="w-11 h-11 mx-auto mb-3 opacity-35" strokeWidth={1.2} />
                                    <p className="text-sm">{language === 'ar' ? `لا نتائج لـ «${searchQuery}»` : `No results for "${searchQuery}"`}</p>
                                </div>
                            ) : (
                            <div className="space-y-3">
                                {searchResults.map((v) => (
                                    <div key={v._id} className="p-5 sm:p-6 bg-[#121a2e]/70 border border-white/[0.08] rounded-2xl hover:border-violet-400/25 transition-all">
                                        <div className="inline-flex text-violet-300 font-black text-[11px] tracking-wide mb-2 px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-400/20">
                                            {v.bookName} {v.chapter}:{v.verseNumber}
                                        </div>
                                        <p className="text-base sm:text-lg font-medium leading-relaxed text-gray-100">{v.text}</p>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Presentation Overlay (Reusing logic from Category_Humns) */}
            <AnimatePresence>
                {showDataShow && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-100 bg-[#0E2238] flex flex-col items-center justify-center p-8 text-center"
                    >
                        <button 
                            onClick={() => setShowDataShow(false)}
                            className="absolute top-8 right-8 p-3 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all"
                        >
                            <X size={32} />
                        </button>

                        <div className="max-w-5xl w-full">
                            <div className="text-sky-400 font-black text-sm uppercase tracking-[0.5em] mb-12">
                                {selectedBook?.bookName} {selectedChapter}:{verses[dataShowIndex]?.verseNumber}
                            </div>
                            <motion.p 
                                key={dataShowIndex}
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                className="text-4xl sm:text-6xl md:text-7xl font-black leading-tight"
                            >
                                {verses[dataShowIndex]?.text}
                            </motion.p>
                        </div>

                        {/* Navigation Dots */}
                        <div className="absolute bottom-12 flex gap-3 overflow-x-auto max-w-full px-8 no-scrollbar">
                            {verses.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setDataShowIndex(i)}
                                    className={`w-3 h-3 rounded-full transition-all ${i === dataShowIndex ? 'bg-sky-400 scale-150 shadow-[0_0_10px_rgba(14,165,233,0.8)]' : 'bg-white/20 hover:bg-white/40'}`}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
