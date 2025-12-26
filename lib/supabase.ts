import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Validar formato de URL
const isValidUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Validar que las variables estén configuradas correctamente
if (typeof window !== 'undefined') {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ Missing Supabase environment variables!');
    console.error('Please add to your .env.local file:');
    console.error('  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co');
    console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here');
    console.error('Get these from: https://supabase.com/dashboard > Your Project > Settings > API');
  } else if (supabaseUrl.includes('your_supabase_url') || supabaseAnonKey.includes('your_')) {
    console.error('⚠️ You still have placeholder values in your .env.local!');
    console.error('Please replace the placeholder values with your actual Supabase credentials.');
    console.error('Get them from: https://supabase.com/dashboard > Your Project > Settings > API');
  } else if (!isValidUrl(supabaseUrl)) {
    console.error('⚠️ Invalid Supabase URL format!');
    console.error(`Current value: "${supabaseUrl}"`);
    console.error('The URL must start with http:// or https://');
    console.error('Example: https://abcdefghijklmnop.supabase.co');
  }
}

// Cliente de Supabase para el cliente (browser)
// Solo crear si tenemos una URL válida
export const supabase = (supabaseUrl && supabaseAnonKey && isValidUrl(supabaseUrl))
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : createBrowserClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder');

// Cliente de Supabase para el servidor (con service role key si es necesario)
export function createServerClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file');
  }

  const { createServerClient: createSSRClient } = require('@supabase/ssr');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (serviceRoleKey) {
    return createSSRClient(supabaseUrl, serviceRoleKey, {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    });
  }
  
  // Si no hay service role key, usar anon key (para operaciones públicas)
  return createSSRClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get() { return undefined; },
      set() {},
      remove() {},
    },
  });
}
