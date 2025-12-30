'use client';
import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { PlayCircle, Trash2, Heart, Music, ListMusic } from 'lucide-react';
import { HymnsContext } from '../context/Hymns_Context';

export default function WorkSpace() {
    const { workspace, removeFromWorkspace } = useContext(HymnsContext);

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
        <section id='WorkSpace-section' className="min-h-screen bg-linear-to-br from-[#050510] via-[#0a0a1a] to-[#141432] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
            {/* Background Gradients - Matching Category Page */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.1),transparent_70%)]" />

            <div className="relative z-10 max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-full mb-4 border border-white/10 backdrop-blur-xl">
                        <ListMusic className="w-8 h-8 text-sky-400" />
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-extrabold bg-linear-to-br from-sky-300 via-indigo-300 to-purple-400 text-transparent bg-clip-text drop-shadow-lg">
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
                        <div className="col-span-2 text-center bg-white/5 rounded-lg py-1">Key</div>
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
                                           border border-white/5 hover:border-red-500/30 
                                           rounded-2xl transition-all duration-300 backdrop-blur-sm
                                           hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
                                >
                                    {/* Index */}
                                    <div className="col-span-1 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
                                        {(index + 1).toString().padStart(2, '0')}
                                    </div>

                                    {/* Song Title & Mobile Info */}
                                    <div className="col-span-11 sm:col-span-5 md:col-span-5 relative z-10">
                                        <h3 className="font-bold text-base sm:text-lg text-gray-200 group-hover:text-white transition-colors tracking-wide">
                                            {hymn.title}
                                        </h3>

                                        {/* Mobile Row Layout */}
                                        <div className="sm:hidden mt-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {hymn.scale && (
                                                    <span className="text-[10px] font-bold text-purple-200 bg-purple-500/20 px-2 py-0.5 rounded-md border border-purple-500/20">
                                                        {hymn.scale}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {hymn.link && (
                                                    <a
                                                        href={hymn.link}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 text-xs font-bold transition-all"
                                                    >
                                                        <PlayCircle className="w-3.5 h-3.5" />
                                                        PLAY
                                                    </a>
                                                )}
                                                <button
                                                    onClick={() => removeFromWorkspace(hymn._id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold transition-all hover:bg-red-500/20"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    REMOVE
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Desktop Key/Scale */}
                                    <div className="hidden sm:block col-span-2 text-center relative z-10">
                                        <span className={`text-sm font-semibold px-3 py-1 rounded-full border border-white/5 
                                      ${hymn.scale ? 'text-purple-300 bg-purple-500/10' : 'text-gray-600'}`}>
                                            {hymn.scale || '-'}
                                        </span>
                                    </div>

                                    {/* Desktop Media Link */}
                                    <div className="hidden sm:flex col-span-3 justify-center relative z-10">
                                        {hymn.link ? (
                                            <a
                                                href={hymn.link}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all"
                                            >
                                                <PlayCircle className="w-4 h-4" />
                                                <span className="text-sm font-medium">Listen</span>
                                            </a>
                                        ) : (
                                            <span className="text-gray-700 text-xs">—</span>
                                        )}
                                    </div>

                                    {/* Desktop Remove Action */}
                                    <div className="hidden sm:flex col-span-1 justify-center relative z-10">
                                        <button
                                            onClick={() => removeFromWorkspace(hymn._id)}
                                            className="p-2.5 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
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
