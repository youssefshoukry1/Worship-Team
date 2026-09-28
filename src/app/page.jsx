import React from 'react'

export default function Home() {
    return (
        <section className="min-h-screen bg-transparent relative overflow-hidden">
            {/* Glowing top effect matching the image */}
            <div className="absolute top-0 left-0 right-0 h-64 bg-[#00C2FF] opacity-[0.07] blur-[100px] rounded-b-full pointer-events-none"></div>
            
            <div className="relative z-10 px-4 pt-12 max-w-md mx-auto flex flex-col items-center justify-center min-h-[70vh]">
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-[#00C2FF]">
                    Wasla
                </h1>
                <p className="text-slate-400 mt-2 text-sm text-center max-w-[250px]">
                    Your homepage feed and content will appear here.
                </p>
            </div>
        </section>
    )
}
