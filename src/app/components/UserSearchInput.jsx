"use client";

import React, { useState, useRef } from "react";
import axios from "axios";

export default function UserSearchInput({ onSelectUser, placeholder = "Search by @username..." }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchTimer = useRef(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://worship-team-api.onrender.com/api";

  const handleSearch = (val) => {
    const clean = val.replace(/^@/, "").toLowerCase();
    setQuery(val);

    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (clean.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${apiBase}/users/search-username?q=${encodeURIComponent(clean)}`);
        setResults(res.data || []);
        setIsOpen(true);
      } catch (err) {
        console.error("User search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSelect = (user) => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    if (onSelectUser) onSelectUser(user);
  };

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <span className="absolute left-3 text-slate-500 font-semibold select-none text-sm">@</span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-7 pr-8 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-sky-500"
        />
        {isSearching && (
          <div className="absolute right-2.5 w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
          {results.map((user) => (
            <button
              key={user._id}
              type="button"
              onClick={() => handleSelect(user)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-slate-800 flex items-center justify-between text-xs sm:text-sm transition-colors border-b border-slate-800/50 last:border-b-0"
            >
              <div>
                <p className="font-semibold text-white">{user.Name}</p>
                <p className="text-sky-400 text-xs">@{user.username || "no-handle"}</p>
              </div>
              {user.ChurchName && (
                <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  {user.ChurchName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && query.replace(/^@/, "").length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute left-0 right-0 mt-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-center text-xs text-slate-400 z-50">
          No users found with @{query.replace(/^@/, "")}
        </div>
      )}
    </div>
  );
}
