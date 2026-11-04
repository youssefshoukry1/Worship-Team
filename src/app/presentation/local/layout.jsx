// Isolated layout for local presentation display — fullscreen without navigation chrome
export default function LocalPresentationLayout({ children }) {
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {children}
    </div>
  );
}
