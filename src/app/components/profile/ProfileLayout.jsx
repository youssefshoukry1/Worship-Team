export default function ProfileLayout({ children }) {
  return <main className="app-page min-h-screen text-white pb-24 transition-colors duration-150">
    <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-6 sm:pt-10">{children}</div>
  </main>;
}
