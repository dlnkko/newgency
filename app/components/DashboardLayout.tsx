'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DashboardLayoutProps {
  children: ReactNode;
}

const tools = [
  {
    id: 'reverse-engineer',
    name: 'Reverse-engineer any AD',
    path: '/tools/reverse-engineer',
    description: 'Deconstruct high-performing ads',
    active: true
  },
  {
    id: 'video-prompt-generator',
    name: 'Video Prompt Generator',
    path: '/tools/video-prompt-generator',
    description: 'Create AI video prompts',
    active: true
  },
  {
    id: 'static-ad-prompt-generator',
    name: 'Static Ad Prompt Generator',
    path: '/tools/static-ad-prompt-generator',
    description: 'Generate static ad prompts from reference',
    active: true
  }
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  // Handle root path redirect
  const normalizedPath = pathname === '/' ? '/tools/reverse-engineer' : pathname;
  const currentTool = tools.find(tool => tool.path === normalizedPath) || tools[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 px-4 py-10 sm:px-6 lg:px-10 text-zinc-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 md:flex-row">
        {/* Sidebar / Dashboard nav */}
        <aside className="hidden w-full max-w-xs rounded-3xl border border-zinc-800/70 bg-zinc-900/80 p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl md:block">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/80">
              AI Ad Lab
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              A focused space for experimenting with next‑gen creative intelligence.
            </p>
          </div>
          <nav className="space-y-2 text-sm">
            {tools.map((tool) => {
              const isActive = tool.path === normalizedPath;
              return (
                <Link
                  key={tool.id}
                  href={tool.path}
                  className={`block rounded-2xl border px-4 py-3 transition-all ${
                    isActive
                      ? 'relative overflow-hidden border-amber-500/60 bg-linear-gradient-to-br from-zinc-900 via-zinc-950 to-black shadow-[0_0_45px_rgba(250,204,21,0.18)]'
                      : 'border-dashed border-zinc-700/70 text-zinc-500 hover:border-amber-500/40 hover:bg-zinc-900/60 hover:text-zinc-200'
                  }`}
                >
                  {isActive && (
                    <div className="pointer-events-none absolute inset-px rounded-2xl border border-amber-200/5" />
                  )}
                  <div className={`relative z-10 flex w-full items-center justify-between gap-2 ${isActive ? 'text-left' : ''}`}>
                    <div className="flex flex-col">
                      {isActive && (
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/90">
                          Active tool
                        </span>
                      )}
                      <span className={`${isActive ? 'mt-1' : ''} text-sm font-medium ${isActive ? 'text-zinc-50' : ''}`}>
                        {tool.name}
                      </span>
                    </div>
                    {isActive ? (
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                        Live
                      </span>
                    ) : (
                      <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        Tool
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
            <button className="flex w-full items-center justify-between gap-2 rounded-2xl border border-dashed border-zinc-700/70 px-4 py-3 text-left text-zinc-500 hover:border-amber-500/40 hover:bg-zinc-900/60 hover:text-zinc-200 transition">
              <span className="font-medium">New tool space</span>
              <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Coming soon
              </span>
            </button>
          </nav>
        </aside>

        {/* Main tool panel */}
        <main className="w-full flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

