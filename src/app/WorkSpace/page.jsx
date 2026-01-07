'use client';
import React, { useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, Trash2, Heart, Music, ListMusic } from 'lucide-react';
import { HymnsContext } from '../context/Hymns_Context';
import { UserContext } from '../context/User_Context';

export default function WorkSpace() {
    const { workspace, removeFromWorkspace } = useContext(HymnsContext);
    const { HymnIds, setHymnIds } = useContext(UserContext);

    // Animation Variants (Reusable from Category_Humns for consistency)
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        show: { y: 0, opacity: 1 }
    };

    return (
        <section id='WorkSpace-section' className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
            {/* Background Gradients - Matching Category Page */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.15),transparent_70%)]" />

            <div className="relative z-10 max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-full mb-4 border border-white/10 backdrop-blur-xl">
                        <ListMusic className="w-8 h-8 text-sky-400" />
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-extrabold bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text drop-shadow-lg">
                        My Workspace
                    </h1>
                    <p className="mt-2 text-gray-400">Manage your setlist for the service</p>
                </div>

                {/* Content Table */}
                <div className="relative">
                    {/* Table Header */}
                    <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest bg-white/5 rounded-t-2xl border-b border-white/10 mx-2">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-11 sm:col-span-5 md:col-span-5">Song Title</div>
                        <div className="col-span-2 text-center bg-white/5 rounded-lg py-1">Key / Chords</div>
                        <div className="col-span-3 text-center">Media</div>
                        <div className="col-span-1 text-center">Remove</div>
                    </div>

                    {/* List Body */}
                    <motion.div
                        className="flex flex-col gap-3 mt-2 pb-20"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                    >
                        {workspace.length > 0 ? (
                            workspace.map((hymn, index) => (
                                <motion.div
                                    key={hymn._id || index}
                                    variants={itemVariants}
                                    className="group relative grid grid-cols-12 gap-4 p-4 sm:p-5 items-center 
                               bg-[#13132b]/60 hover:bg-[#1a1a38] 
                               border border-white/5 hover:border-sky-500/30 
                               rounded-2xl transition-all duration-300 backdrop-blur-sm
                               hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
                                >
                                    {/* Index */}
                                    <div className="col-span-2 sm:col-span-1 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
                                        {(index + 1).toString().padStart(2, '0')}
                                    </div>

                                    {/* Song Title */}
                                    <div className="col-span-10 sm:col-span-5 md:col-span-5 relative z-10 flex items-center">
                                        <h3 className="font-bold text-base sm:text-lg text-gray-200 group-hover:text-white transition-colors tracking-wide">
                                            {hymn.title}
                                        </h3>
                                    </div>

                                    {/* Key/Scale - Under Title on Mobile (Left Aligned), Center on Desktop */}
                                    <div className="col-span-12 sm:col-span-2 relative z-10 flex items-center justify-start sm:justify-center -mt-2 sm:mt-0 pl-2 sm:pl-0">
                                        <KeyDisplay humn_parameter={hymn} />
                                    </div>

                                    {/* Media Link */}
                                    <div className="col-span-6 sm:col-span-3 flex justify-center items-center relative z-10">
                                        {hymn.link ? (
                                            <a
                                                href={hymn.link}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all w-full sm:w-auto justify-center"
                                            >
                                                <PlayCircle className="w-4 h-4" />
                                                <span className="text-sm font-medium">Listen</span>
                                            </a>
                                        ) : (
                                            <span className="text-gray-700 text-xs">—</span>
                                        )}
                                    </div>

                                    {/* Remove Action */}
                                    <div className="col-span-6 sm:col-span-1 flex justify-center items-center relative z-10">
                                        <button
                                            onClick={() => removeFromWorkspace(hymn._id)}
                                            className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5 sm:border-transparent hover:border-red-500/20 bg-white/5 sm:bg-transparent flex-1 sm:flex-none flex justify-center"
                                            title="Remove from Workspace"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            ))
                        ) : (
                            <div className="p-20 text-center flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                                <Heart className="w-12 h-12 mb-4 opacity-50 text-sky-400" />
                                <h3 className="text-xl font-bold text-gray-300 mb-2">Your workspace is empty</h3>
                                <p className="text-sm text-gray-500">Go to the Hymns Library to add some songs.</p>
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </section>
    )
}

// Sub-component for handling Key/Chords toggle state (Reused)
function KeyDisplay({ humn_parameter }) {
    const [showChords, setShowChords] = useState(false);

    return (
        <div className="flex flex-col items-start sm:items-center gap-2 w-full">
            <div className="flex items-center gap-1">
                <span className={`text-sm font-semibold px-3 py-1 rounded-full border border-white/5 
          ${humn_parameter.scale ? 'text-blue-300 bg-blue-500/10' : 'text-gray-600'}`}>
                    {humn_parameter.scale || '-'}
                </span>

                {humn_parameter.relatedChords && (
                    <button
                        onClick={() => setShowChords(!showChords)}
                        className={`p-1 rounded-full transition-all duration-300 border border-transparent 
              ${showChords
                                ? 'bg-sky-500/20 text-sky-300 rotate-180 border-sky-500/30'
                                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
                        title="Show Related Chords"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                )}
            </div>

            <AnimatePresence>
                {showChords && humn_parameter.relatedChords && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, y: -5 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -5 }}
                        className="overflow-hidden w-full flex justify-start sm:justify-center"
                    >
                        <div className="mt-1 flex flex-wrap justify-start sm:justify-center gap-1.5 w-full sm:max-w-[200px]">
                            {humn_parameter.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, i) => (
                                <span key={i} className="text-[10px] uppercase font-bold text-sky-200 bg-sky-900/30 px-1.5 py-0.5 rounded border border-sky-500/20">
                                    {chord}
                                </span>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
