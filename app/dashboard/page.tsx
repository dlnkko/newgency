'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 px-4 py-6 sm:px-6 sm:py-10 lg:px-10 text-zinc-50">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/80">
              AI Ad Lab
            </p>
            <a
              href="/api/auth/logout"
              className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              Sign out
            </a>
          </div>
          <h1 className="mb-4 text-4xl font-bold text-zinc-50 sm:text-5xl">
            A focused space for experimenting with next‑gen creative intelligence.
          </h1>
          <p className="text-lg text-zinc-400">
            Choose a tool to get started
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              id: 'reverse-engineer',
              name: 'Reverse-engineer any AD',
              path: '/tools/reverse-engineer',
              description: 'Deconstruct high-performing ads',
              icon: '🔬',
            },
            {
              id: 'video-prompt-generator',
              name: 'Video Prompt Generator',
              path: '/tools/video-prompt-generator',
              description: 'Create AI video prompts',
              icon: '🎬',
            },
            {
              id: 'static-ad-prompt-generator',
              name: 'Static Ad Prompt Generator',
              path: '/tools/static-ad-prompt-generator',
              description: 'Generate static ad prompts from reference',
              icon: '🖼️',
            },
            {
              id: 'product-video-generator',
              name: 'Product Video Generator',
              path: '/tools/product-video-generator',
              description: 'Generate professional product video prompts',
              icon: '📹',
            },
            {
              id: 'viral-script-generator',
              name: 'Viral Script Generator',
              path: '/tools/viral-script-generator',
              description: 'Create viral UGC marketing scripts',
              icon: '🚀',
            },
          ].map((tool) => (
            <Link
              key={tool.id}
              href={tool.path}
              className="group relative rounded-2xl border-2 border-zinc-800/70 bg-gradient-to-br from-zinc-900/90 via-zinc-950/90 to-black p-6 transition-all duration-300 hover:border-amber-500/60 hover:shadow-[0_0_45px_rgba(250,204,21,0.18)]"
            >
              {/* Icon */}
              <div className="mb-4 text-4xl transition-transform duration-300 group-hover:scale-110">
                {tool.icon}
              </div>

              {/* Tool Name */}
              <h3 className="mb-2 text-xl font-bold text-zinc-50 transition-colors duration-300 group-hover:text-amber-300">
                {tool.name}
              </h3>

              {/* Description */}
              <p className="text-sm text-zinc-400 transition-colors duration-300 group-hover:text-zinc-300">
                {tool.description}
              </p>

              {/* Hover Arrow */}
              <div className="mt-4 flex items-center text-sm font-semibold text-amber-400/70 opacity-0 transition-all duration-300 group-hover:translate-x-2 group-hover:opacity-100">
                <span>Open tool</span>
                <svg
                  className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Live Badge */}
              <div className="absolute right-4 top-4">
                <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Live
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-zinc-500">
            Select a tool above to start creating
          </p>
        </div>
      </div>
    </div>
  );
}
