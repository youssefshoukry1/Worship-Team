import { Geist, Geist_Mono, Noto_Naskh_Arabic, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import UserContextProvider from "./context/User_Context";
import HymnsContextProvider from "./context/Hymns_Context";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider } from "./context/ThemeContext";
import SmoothScroll from "./SmoothScroll"
import ServiceWorkerRegistry from "./components/ServiceWorkerRegistry";
import ToastContainer from "./components/ToastContainer";
import ReactQueryProvider from "../app/utils/ReactQueryProvider";
import CapgoUpdater from "./CapgoUpdater";
import WaslaSplashIntro from "./components/WaslaSplashIntro";
import AppAuthGatekeeper from "./components/AppAuthGatekeeper";
import PrayerBackupLifecycle from "./components/PrayerBackupLifecycle";
import PrayerSyncLifecycle from "./components/PrayerSyncLifecycle";
import BillingLifecycle from './components/BillingLifecycle';
import AndroidBackNavigation from './components/AndroidBackNavigation';
import IOSBackNavigation from './components/IOSBackNavigation';
import TestimonyFeedProvider from './components/testimonies/TestimonyFeedProvider';

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

const notoNaskhArabic = Noto_Naskh_Arabic({
    variable: "--font-noto-naskh-arabic",
    subsets: ["arabic"],
    weight: ["400", "500", "600", "700"],
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
    variable: "--font-ibm-plex-sans-arabic",
    subsets: ["arabic"],
    weight: ["400", "500", "600", "700"],
});

export const metadata = {
    title: "Wasla",
    description: "وصلة - كتاب ترانيم - الكتاب المقدس",
    icons: {
        icon: "/wasla.jpg", // هيظهر بدل أي favicon افتراضي
    },
};


export default function RootLayout({
    children,
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <meta name="theme-color" content="#060b13" />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var r=document.documentElement,t=localStorage.getItem("taspe7_theme"),l=localStorage.getItem("app-language"),d=t==="dark";r.classList.toggle("dark",d);r.setAttribute("data-theme",d?"dark":"light");document.querySelector('meta[name="theme-color"]').setAttribute("content",d?"#090c0f":"#060b13");r.setAttribute("data-startup-language",["en","ar","de"].includes(l)?l:"ar");r.setAttribute("data-startup-session",localStorage.getItem("user_Taspe7_Token")&&localStorage.getItem("user_Taspe7_Username")?"returning":"guest");}catch(_){}})();`
                    }}
                />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} ${notoNaskhArabic.variable} ${ibmPlexSansArabic.variable} antialiased text-white min-h-screen`}
            >
                <WaslaSplashIntro />
                <ServiceWorkerRegistry />
                <ToastContainer />
                <SmoothScroll>
                    <ReactQueryProvider>
                        <ThemeProvider>
                            <LanguageProvider>
                                <UserContextProvider>
                                    <AndroidBackNavigation />
                                    <IOSBackNavigation />
                                    <CapgoUpdater />
                                    <PrayerBackupLifecycle />
                                    <PrayerSyncLifecycle />
                                    <BillingLifecycle />
                                    <TestimonyFeedProvider><HymnsContextProvider>
                                        <AppAuthGatekeeper>
                                            <main>
                                                {children}
                                            </main>
                                        </AppAuthGatekeeper>
                                    </HymnsContextProvider></TestimonyFeedProvider>
                                </UserContextProvider>
                            </LanguageProvider>
                        </ThemeProvider>
                    </ReactQueryProvider>
                </SmoothScroll>


            </body>
        </html>
    );
}
