'use client';

// Esta página solo se renderizará brevemente antes de que el middleware redirija
// Si el usuario tiene sesión válida, será redirigido a /dashboard
// Si no tiene sesión, será redirigido a /login
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 flex items-center justify-center px-4">
      <div className="text-zinc-400">Cargando...</div>
    </div>
  );
}
