import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./Navbar/Navbar";
import Footer from "./Footer/Footer";
import PageTransition from "./page-transition/page-transition";
import UserContextProvider from "./context/User_Context";
import QueryProvider from "../../QueryProvider";
import HymnsContextProvider from "./context/Hymns_Context";
import { LanguageProvider } from "./context/LanguageContext";
import  SmoothScroll  from "./SmoothScroll"
import { useEffect } from "react";
import axios from "axios";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata = {
    title: "Worship Team",
    description: "تسبيحنا يرتفع للسماء",
    icons: {
        icon: "/worship-bg.webp", // هيظهر بدل أي favicon افتراضي
    },
};

export default function RootLayout({
    children,
}) {
    useEffect(() => {
        // Ping the backend to wake it up from sleep (Render Free Tier cold start)
        const wakeUpServer = async () => {
            try {
                // We use any small endpoint, /api/ping is best
                await axios.get("https://worship-team-api.onrender.com/api/ping");
                console.log("🚀 Server woke up!");
            } catch (err) {
                console.error("Wake up ping failed:", err);
            }
        };
        wakeUpServer();
    }, []);

    return (
        <html lang="en">
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <SmoothScroll>
                    <LanguageProvider>
                        <UserContextProvider>
                            <HymnsContextProvider>
                                <Navbar />
                                <QueryProvider>
                                    <PageTransition>{children}</PageTransition>
                                </QueryProvider>
                                <Footer />
                            </HymnsContextProvider>
                        </UserContextProvider>
                    </LanguageProvider>
                </SmoothScroll>

            </body>
        </html>
    );
}
