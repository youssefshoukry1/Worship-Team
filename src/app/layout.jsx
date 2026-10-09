import { Geist, Geist_Mono, Noto_Naskh_Arabic } from "next/font/google";
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
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var t=localStorage.getItem("taspe7_theme");if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-theme","dark");}}catch(_){}})();`
                    }}
                />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} ${notoNaskhArabic.variable} antialiased text-white min-h-screen`}
            >
                <WaslaSplashIntro />
                <CapgoUpdater />
                <ServiceWorkerRegistry />
                <ToastContainer />
                <SmoothScroll>
                    <ReactQueryProvider>
                        <ThemeProvider>
                            <LanguageProvider>
                                <UserContextProvider>
                                    <HymnsContextProvider>
                                        <AppAuthGatekeeper>
                                            <main>
                                                {children}
                                            </main>
                                        </AppAuthGatekeeper>
                                    </HymnsContextProvider>
                                </UserContextProvider>
                            </LanguageProvider>
                        </ThemeProvider>
                    </ReactQueryProvider>
                </SmoothScroll>


            </body>
        </html>
    );
}
