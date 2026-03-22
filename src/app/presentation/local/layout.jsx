// Isolated layout for local presentation display — no Navbar, no Footer, pure fullscreen
export default function LocalPresentationLayout({ children }) {
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {children}
    </div>
  );
}
