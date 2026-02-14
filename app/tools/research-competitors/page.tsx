'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';

interface CompetitorProfile {
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  id?: string;
}

export default function ResearchCompetitors() {
  const [username, setUsername] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleResearch = async () => {
    if (!username.trim()) {
      setError('Please enter an Instagram username');
      return;
    }

    setIsLoading(true);
    setError(null);
    setCompetitors([]);

    try {
      const response = await fetch('/api/research-competitors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to research competitors');
      }

      if (data.competitors && Array.isArray(data.competitors)) {
        setCompetitors(data.competitors);
      } else {
        setError('No competitors found or invalid response format');
      }
    } catch (err: any) {
      console.error('Error researching competitors:', err);
      setError(err.message || 'An error occurred while researching competitors');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      handleResearch();
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-zinc-50">Research Competitors</h1>
          <p className="text-zinc-400">
            Enter an Instagram username to find related profiles and competitors
          </p>
        </div>

        {/* Input Section */}
        <div className="mb-8 rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-6">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Instagram Username
          </label>
          <div className="flex gap-4">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter Instagram username (without @)"
              disabled={isLoading}
              className="flex-1 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleResearch}
              disabled={isLoading || !username.trim()}
              className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 font-semibold text-white transition-all hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-orange-500"
            >
              {isLoading ? 'Researching...' : 'Research'}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Results Section */}
        {competitors.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-bold text-zinc-50">
              Found {competitors.length} Related Profile{competitors.length !== 1 ? 's' : ''}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {competitors.map((competitor, index) => (
                <a
                  key={competitor.id || competitor.username || index}
                  href={`https://instagram.com/${competitor.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative overflow-hidden rounded-xl border border-zinc-700/50 bg-gradient-to-br from-zinc-800/40 to-zinc-800/20 p-5 transition-all duration-300 hover:border-amber-500/60 hover:bg-gradient-to-br hover:from-zinc-800/60 hover:to-zinc-800/40 hover:shadow-lg hover:shadow-amber-500/10"
                >
                  {/* Hover effect background */}
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/0 to-amber-500/0 transition-all duration-300 group-hover:from-amber-500/5 group-hover:via-amber-500/3 group-hover:to-amber-500/5"></div>
                  
                  {/* Content */}
                  <div className="relative flex items-center gap-4">
                    {/* Instagram icon placeholder */}
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 ring-2 ring-zinc-700/50 transition-all duration-300 group-hover:ring-amber-500/50 group-hover:from-purple-500/30 group-hover:to-pink-500/30">
                      <svg
                        className="h-6 w-6 text-zinc-400 transition-colors group-hover:text-amber-400"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    
                    {/* Text content */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-bold text-zinc-50 transition-colors group-hover:text-amber-400">
                        @{competitor.username}
                      </p>
                      {competitor.full_name && (
                        <p className="mt-1 truncate text-sm text-zinc-400">
                          {competitor.full_name}
                        </p>
                      )}
                    </div>
                    
                    {/* External link icon */}
                    <div className="flex-shrink-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-700/50 text-zinc-400 transition-all duration-300 group-hover:bg-amber-500/20 group-hover:text-amber-400">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* Bottom accent line */}
                  <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300 group-hover:w-full"></div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-amber-500"></div>
              <p className="text-zinc-400">Researching competitors...</p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

