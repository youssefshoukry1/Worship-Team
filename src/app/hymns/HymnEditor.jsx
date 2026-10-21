'use client';

import Portal from '../Portal/Portal';
import { Music, PlusCircle, X } from 'lucide-react';
import StanzaSlideControls from '../components/StanzaSlideControls';
import { sanitizeSlideBreaks } from '../utils/hymnSlides';

export default function HymnEditor({ view }) {
  const {
    add_Hymn,
    closeModal,
    edit_Hymn,
    editingHymnId,
    formData,
    hymnCategories,
    isSubmitting,
    setFormData,
    t
  } = view;
  return (
    <Portal>
      <div data-feature="hymn-editor"
        className="fixed inset-0 z-9999 flex justify-center items-center p-4 backdrop-blur-md bg-black/70"
      >
        <div
          className="w-full max-w-md max-h-[90vh] bg-[#0c0c20] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto relative"
          data-lenis-prevent-wheel
        >
          {/* Header */}
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
            <h2 className="text-2xl font-bold bg-linear-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
              {editingHymnId ? `✏️ ${t("editHymn")}` : `🎵 ${t("addNewHymn")}`}
            </h2>
            <button onClick={closeModal} className="text-gray-400 hover:text-white transition">
              <X className="w-6 h-6" />
            </button>
          </div>
    
          {/* Form */}
          <div className="p-6 flex flex-col gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">{t("songTitle")}</label>
              <input
                type="text"
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                placeholder="e.g. Amazing Grace"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
    
            {/* Lyrics Structure Builder */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                <label className="text-gray-200 text-sm font-semibold">{t("lyrics")}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newArray = Array.isArray(formData.lyrics) ? [...formData.lyrics] : [];
                      newArray.push({ type: 'verse', title: String(newArray.filter(l => l.type === 'verse').length + 1), text: '', slideMode: 'manual', slideBreaks: [] });
                      setFormData({ ...formData, lyrics: newArray });
                    }}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" /> العدد
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newArray = Array.isArray(formData.lyrics) ? [...formData.lyrics] : [];
                      newArray.push({ type: 'chorus', title: 'القرار', text: '', slideMode: 'manual', slideBreaks: [] });
                      setFormData({ ...formData, lyrics: newArray });
                    }}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 hover:bg-sky-500/30 text-sky-200 transition-colors flex items-center gap-1.5 shadow-sm shadow-sky-500/10"
                  >
                    <PlusCircle className="w-4 h-4" /> القرار
                  </button>
                </div>
              </div>
    
              {Array.isArray(formData.lyrics) && formData.lyrics.map((stanza, idx) => (
                <div key={idx} className={`p-4 rounded-xl border relative flex flex-col gap-3 transition-colors ${stanza.type === 'chorus' ? 'bg-sky-500/10 border-sky-500/30 shadow-[inset_0_0_20px_rgba(56,189,248,0.05)]' : 'bg-[#151525] border-white/10'}`}>
    
                  <div className="flex justify-between items-center gap-2 pb-2 border-b border-white/5">
                    <input
                      type="text"
                      value={stanza.title}
                      onChange={(e) => {
                        const newArray = [...formData.lyrics];
                        newArray[idx].title = e.target.value;
                        setFormData({ ...formData, lyrics: newArray });
                      }}
                      className={`text-sm font-bold bg-transparent border-none outline-none w-32 px-1 focus:ring-0 ${stanza.type === 'chorus' ? 'text-white placeholder-white/50' : 'text-gray-300 placeholder-gray-500'}`}
                      placeholder={stanza.type === 'chorus' ? "القرار" : "1"}
                      dir="rtl"
                    />
    
                    <div className="flex items-center gap-3 flex-wrap flex-row-reverse">
                      {/* Chord Toolbar for this specific text area */}
                      {formData.relatedChords && (
                        <div className="flex gap-1.5 flex-wrap justify-end pl-3 border-l border-white/10">
                          {formData.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, cIdx) => (
                            <button
                              key={cIdx}
                              onClick={() => {
                                const textareaId = `lyrics-textarea-${idx}`;
                                const input = document.getElementById(textareaId);
                                if (input) {
                                  const start = input.selectionStart;
                                  const end = input.selectionEnd;
                                  const text = input.value;
                                  const newText = text.substring(0, start) + `[${chord}]` + text.substring(end);
                                  const newArray = [...formData.lyrics];
                                  newArray[idx].text = newText;
                                  setFormData({ ...formData, lyrics: newArray });
                                  setTimeout(() => {
                                    input.selectionStart = input.selectionEnd = start + chord.length + 2;
                                    input.focus();
                                  }, 0);
                                }
                              }}
                              className="text-[10px] font-black px-2.5 py-1 rounded-md cursor-pointer select-none bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 hover:text-white transition-all shadow-sm active:scale-95"
                              type="button"
                            >
                              {chord}
                            </button>
                          ))}
                        </div>
                      )}
    
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm('هل تريد مسح هذا المقطع؟')) return;
                          const newArray = formData.lyrics.filter((_, i) => i !== idx);
                          setFormData({ ...formData, lyrics: newArray });
                        }}
                        className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-full hover:bg-red-500/10"
                        title="Remove section"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
    
                  <textarea
                    id={`lyrics-textarea-${idx}`}
                    dir="rtl"
                    className="w-full p-3 rounded-lg bg-black/40 border border-black/50 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition min-h-[100px] resize-y whitespace-pre-wrap text-sm leading-relaxed custom-scrollbar shadow-inner"
                    placeholder="كلمات المقطع هنا (سطر واحد لكل بيت — بدون فراغات بين الشرائح)..."
                    value={stanza.text}
                    onChange={(e) => {
                      const newArray = [...formData.lyrics];
                      const text = e.target.value;
                      const lineCount = text.split('\n').filter((l) => l.trim()).length;
                      newArray[idx] = {
                        ...newArray[idx],
                        text,
                        slideBreaks: sanitizeSlideBreaks(newArray[idx].slideBreaks, lineCount),
                      };
                      setFormData({ ...formData, lyrics: newArray });
                    }}
                  />
    
                  <StanzaSlideControls
                    stanza={stanza}
                    stanzaIndex={idx}
                    onChange={(stanzaIdx, updatedStanza) => {
                      const newArray = [...formData.lyrics];
                      newArray[stanzaIdx] = updatedStanza;
                      setFormData({ ...formData, lyrics: newArray });
                    }}
                  />
                </div>
              ))}
    
              {(!formData.lyrics || formData.lyrics.length === 0) && (
                <div className="text-center p-8 border border-dashed border-white/10 rounded-xl bg-white/5">
                  <Music className="w-8 h-8 text-gray-500 mx-auto mb-3 opacity-50" />
                  <p className="text-gray-400 text-sm font-medium">اضغط على <span className="text-sky-400">القرار</span> أو <span className="text-white">العدد</span> للبدء في كتابة الترتيلة</p>
                </div>
              )}
            </div>
    
    
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">{t("scale")}</label>
                <input
                  type="text"
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition"
                  placeholder="e.g. C Major"
                  value={formData.scale}
                  onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">{t("category")}</label>
                <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                  {hymnCategories.map((cat) => {
                    const isSelected = formData.party.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          let newParty;
                          if (isSelected) {
                            newParty = formData.party.filter(p => p !== cat.id);
                            if (newParty.length === 0) newParty = ['all'];
                          } else {
                            // If selecting something other than 'all', remove 'all' if it's there
                            if (cat.id !== 'all') {
                              newParty = [...formData.party.filter(p => p !== 'all'), cat.id];
                            } else {
                              // If selecting 'all', remove everything else
                              newParty = ['all'];
                            }
                          }
                          setFormData({ ...formData, party: newParty });
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5
                          ${isSelected
                            ? 'bg-sky-500/20 border-sky-400/50 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                          }`}
                      >
                        <cat.icon className="w-3 h-3" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
    
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">{t("bpm")}</label>
                <input
                  type="text"
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition"
                  placeholder="e.g. 120"
                  value={formData.BPM}
                  onChange={(e) => setFormData({ ...formData, BPM: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">{t("timeSignature")}</label>
                <select
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition [&>option]:bg-gray-900"
                  value={formData.timeSignature}
                  onChange={(e) => setFormData({ ...formData, timeSignature: e.target.value })}
                >
                  <option value="None">None</option>
                  <option value="2/2">2/2</option>
                  <option value="1/4">1/4</option>
                  <option value="2/4">2/4</option>
                  <option value="3/4">3/4</option>
                  <option value="4/4">4/4</option>
                  <option value="5/4">5/4</option>
                  <option value="6/8">6/8</option>
                  <option value="7/8">7/8</option>
                  <option value="8/8">8/8</option>
                  <option value="9/8">9/8</option>
                  <option value="10/8">10/8</option>
                </select>
              </div>
            </div>
    
    
    
            <div>
              <label className="block text-gray-400 text-sm mb-2">{t("relatedChords")}</label>
              <input
                type="text"
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition placeholder-gray-600 mb-2"
                placeholder="e.g. G, C, D, Em"
                value={formData.relatedChords}
                onChange={(e) => setFormData({ ...formData, relatedChords: e.target.value })}
              />
              {formData.relatedChords && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  {formData.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, i) => (
                    <span key={i} className="text-[10px] font-bold text-green-300 bg-green-500/10 px-2 py-0.5 rounded-lg border border-green-500/20">
                      {chord}
                    </span>
                  ))}
                </div>
              )}
            </div>
    
            <div>
              <label className="block text-gray-400 text-sm mb-2">{t("youtubeLink")}</label>
              <input
                type="text"
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                placeholder="https://youtube.com/..."
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
              />
            </div>
    
            <button
              onClick={() => editingHymnId ? edit_Hymn(editingHymnId) : add_Hymn()}
              disabled={isSubmitting || !formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim())}
              className={`mt-4 w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all
              ${(isSubmitting || !formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim()))
                  ? 'bg-gray-600 cursor-not-allowed'
                  : editingHymnId
                    ? 'bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 hover:shadow-blue-500/25'
                    : 'bg-linear-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/25'}`}
            >
              {isSubmitting ? (editingHymnId ? t("updating") : t("adding")) : (editingHymnId ? t("updateSong") : t("addSong"))}
            </button>
          </div>
    
        </div>
      </div>
    </Portal>
  );
}
