'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DashboardPage() {
  const router = useRouter();

  const tools = [
    {
      id: 'reverse-engineer',
      name: 'Reverse-engineer any AD',
      path: '/tools/reverse-engineer',
      description: 'Deconstruct high-performing ads and extract audience insights',
      icon: '🔬',
      gradient: 'from-amber-500/20 via-orange-500/10 to-red-500/20',
      borderGlow: 'rgba(250, 204, 21, 0.3)',
    },
    {
      id: 'video-prompt-generator',
      name: 'Video Prompt Generator',
      path: '/tools/video-prompt-generator',
      description: 'Create detailed AI video prompts with cinematic precision',
      icon: '🎬',
      gradient: 'from-blue-500/20 via-purple-500/10 to-pink-500/20',
      borderGlow: 'rgba(59, 130, 246, 0.3)',
    },
    {
      id: 'static-ad-prompt-generator',
      name: 'Static Ad Prompt Generator',
      path: '/tools/static-ad-prompt-generator',
      description: 'Generate professional static ad prompts from reference images',
      icon: '🖼️',
      gradient: 'from-green-500/20 via-emerald-500/10 to-teal-500/20',
      borderGlow: 'rgba(34, 197, 94, 0.3)',
    },
    {
      id: 'product-video-generator',
      name: 'Animator Tool',
      path: '/tools/product-video-generator',
      description: 'Generate professional product video prompts with animation',
      icon: '📹',
      gradient: 'from-cyan-500/20 via-sky-500/10 to-blue-500/20',
      borderGlow: 'rgba(6, 182, 212, 0.3)',
    },
    {
      id: 'viral-script-generator',
      name: 'Viral Script Generator',
      path: '/tools/viral-script-generator',
      description: 'Create viral UGC marketing scripts that convert',
      icon: '🚀',
      gradient: 'from-pink-500/20 via-rose-500/10 to-red-500/20',
      borderGlow: 'rgba(236, 72, 153, 0.3)',
    },
    {
      id: 'research-competitors',
      name: 'Research Competitors',
      path: '/tools/research-competitors',
      description: 'Find related Instagram profiles and competitors',
      icon: '🔍',
      gradient: 'from-indigo-500/20 via-purple-500/10 to-pink-500/20',
      borderGlow: 'rgba(99, 102, 241, 0.3)',
    },
    {
      id: 'image-prompt-generator',
      name: 'Image Prompt Generator',
      path: '/tools/image-prompt-generator',
      description: 'Generate professional image prompts with multiple styles',
      icon: '✨',
      gradient: 'from-violet-500/20 via-purple-500/10 to-fuchsia-500/20',
      borderGlow: 'rgba(139, 92, 246, 0.3)',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 px-4 py-8 sm:px-6 sm:py-12 lg:px-10 text-zinc-50">
      <div className="mx-auto w-full max-w-7xl">
        {/* Header Section */}
        <div className="mb-16 text-center">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 p-2 backdrop-blur-sm">
                <span className="text-lg">🧪</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/90">
                AI Ad Lab
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/settings"
                className="group relative rounded-xl border border-zinc-800/50 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-400 backdrop-blur-sm transition-all hover:border-amber-500/40 hover:bg-zinc-900/80 hover:text-zinc-300"
              >
                <span className="relative z-10">⚙️ Settings</span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-amber-500/0 via-amber-500/5 to-amber-500/0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
              <a
                href="/api/auth/logout"
                className="group relative rounded-xl border border-zinc-800/50 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-400 backdrop-blur-sm transition-all hover:border-amber-500/40 hover:bg-zinc-900/80 hover:text-zinc-300"
              >
                <span className="relative z-10">Sign out</span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-amber-500/0 via-amber-500/5 to-amber-500/0 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </div>
          </div>
          
          <h1 className="mb-4 bg-gradient-to-r from-zinc-50 via-amber-50 to-zinc-50 bg-clip-text text-4xl font-bold text-transparent sm:text-6xl lg:text-7xl">
            Creative Intelligence
            <span className="block mt-2 text-3xl sm:text-4xl lg:text-5xl text-zinc-400">
              for Next-Gen Ads
            </span>
          </h1>
          
          <p className="mx-auto max-w-2xl text-lg text-zinc-400 sm:text-xl">
            A focused workspace for experimenting with AI-powered creative tools
          </p>

          {/* Stats Bar */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800/50 bg-zinc-900/30 px-4 py-2 backdrop-blur-sm">
              <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              <span className="text-xs font-medium text-zinc-400">6 Tools Available</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800/50 bg-zinc-900/30 px-4 py-2 backdrop-blur-sm">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-zinc-400">All Systems Operational</span>
            </div>
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool, index) => (
            <Link
              key={tool.id}
              href={tool.path}
              className="group relative overflow-hidden rounded-3xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 via-zinc-950/80 to-black p-8 backdrop-blur-sm transition-all duration-500 hover:border-amber-500/40 hover:shadow-[0_0_60px_rgba(250,204,21,0.15)] hover:-translate-y-1"
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            >
              {/* Animated Background Gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />
              
              {/* Glow Effect */}
              <div 
                className="absolute -inset-[1px] rounded-3xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-50"
                style={{ boxShadow: `0 0 40px ${tool.borderGlow}` }}
              />

              {/* Content */}
              <div className="relative z-10">
                {/* Icon Container */}
                <div className="mb-6 inline-flex rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-4 backdrop-blur-sm transition-all duration-500 group-hover:scale-110 group-hover:border-amber-500/30 group-hover:bg-zinc-900/80">
                  <span className="text-4xl transition-transform duration-500 group-hover:scale-110">
                    {tool.icon}
                  </span>
                </div>

                {/* Tool Name */}
                <h3 className="mb-3 text-xl font-bold text-zinc-50 transition-colors duration-300 group-hover:text-amber-300 sm:text-2xl">
                  {tool.name}
                </h3>

                {/* Description */}
                <p className="mb-6 text-sm leading-relaxed text-zinc-400 transition-colors duration-300 group-hover:text-zinc-300">
                  {tool.description}
                </p>

                {/* Hover Action */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-400/70 opacity-0 transition-all duration-500 group-hover:translate-x-2 group-hover:opacity-100">
                    <span>Open tool</span>
                    <svg
                      className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  
                  {/* Live Badge */}
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                      Live
                    </span>
                  </div>
                </div>
              </div>

              {/* Decorative Corner Elements */}
              <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/5 blur-3xl transition-all duration-500 group-hover:bg-amber-500/10 group-hover:scale-150" />
              <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-1/2 translate-y-1/2 rounded-full bg-purple-500/5 blur-2xl transition-all duration-500 group-hover:bg-purple-500/10 group-hover:scale-150" />
            </Link>
          ))}
        </div>

        {/* Footer Section */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800/50 bg-zinc-900/30 px-6 py-4 backdrop-blur-sm">
            <svg className="h-5 w-5 text-amber-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-sm font-medium text-zinc-400">
              Select a tool above to start creating powerful AI-generated content
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
