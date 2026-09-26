import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UserContextProvider from "./context/User_Context";
import HymnsContextProvider from "./context/Hymns_Context";
import { LanguageProvider } from "./context/LanguageContext";
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

export const metadata = {
    title: "Wasla",
    description: "تسبيحنا يرتفع للسماء",
    icons: {
        icon: "/wasla.jpg", // هيظهر بدل أي favicon افتراضي
    },
};


export default function RootLayout({
    children,
}) {
    return (
        <html lang="en">
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <WaslaSplashIntro />
                <CapgoUpdater />
                <ServiceWorkerRegistry />
                <ToastContainer />
                <SmoothScroll>
                    <ReactQueryProvider>
                        <LanguageProvider>
                            <UserContextProvider>
                                <HymnsContextProvider>
                                    <AppAuthGatekeeper>
                                        {children}
                                    </AppAuthGatekeeper>
                                </HymnsContextProvider>
                            </UserContextProvider>
                        </LanguageProvider>
                    </ReactQueryProvider>
                </SmoothScroll>


            </body>
        </html>
    );
}
