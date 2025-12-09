import Firecrawl from '@mendable/firecrawl-js';

// Get API key from environment variable
const apiKey = process.env.FIRECRAWL_API_KEY || '';

if (!apiKey) {
  throw new Error('FIRECRAWL_API_KEY is not set in environment variables');
}

// Clean the API key - remove duplicate 'fc-' prefix if present
const cleanApiKey = apiKey.startsWith('fc-fc-') ? apiKey.replace('fc-fc-', 'fc-') : apiKey;

const firecrawl = new Firecrawl({ apiKey: cleanApiKey });

export default firecrawl;


