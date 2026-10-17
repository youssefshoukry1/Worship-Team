import { Amiri, Cinzel, IM_Fell_English_SC } from "next/font/google";

const amiri = Amiri({
    variable: "--font-amiri",
    subsets: ["arabic", "latin"],
    weight: ["400", "700"],
    display: "swap",
});

const cinzel = Cinzel({
    variable: "--font-cinzel",
    subsets: ["latin"],
    weight: ["400", "600"],
    display: "swap",
});

const imFellEnglishSC = IM_Fell_English_SC({
    variable: "--font-im-fell-english-sc",
    subsets: ["latin"],
    weight: "400",
    display: "swap",
});

export default function PresentationLayout({ children }) {
    return (
        <div className={`${amiri.variable} ${cinzel.variable} ${imFellEnglishSC.variable}`}>
            {children}
        </div>
    );
}
