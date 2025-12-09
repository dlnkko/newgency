import Firecrawl from '@mendable/firecrawl-js';

// Helper function to get Firecrawl instance at runtime
function getFirecrawlInstance() {
  const apiKey = process.env.FIRECRAWL_API_KEY || '';
  
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY is not set in environment variables. Please configure it in Vercel dashboard or .env.local file.');
  }
  
  // Clean the API key - remove duplicate 'fc-' prefix if present
  const cleanApiKey = apiKey.startsWith('fc-fc-') ? apiKey.replace('fc-fc-', 'fc-') : apiKey;
  
  return new Firecrawl({ apiKey: cleanApiKey });
}

// Export a function that returns the instance at runtime
export default getFirecrawlInstance;


