import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./Navbar/Navbar";
import Footer from "./Footer/Footer";
import PageTransition from "./page-transition/page-transition";
import UserContextProvider from "./context/User_Context";
import QueryProvider from "../../QueryProvider";
import HymnsContextProvider from "./context/Hymns_Context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Worship Team",
  description: "تسبيحنا يرتفع للسماء",
  icons: {
    icon: "/worship-bg.webp", // هيظهر بدل أي favicon افتراضي
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar/>
        <HymnsContextProvider>
        <UserContextProvider>
          <QueryProvider>
        <PageTransition>
          {children}
        </PageTransition>
          </QueryProvider>
        </UserContextProvider>
        </HymnsContextProvider>

        
        <Footer/>
      </body>
    </html>
  );
}
