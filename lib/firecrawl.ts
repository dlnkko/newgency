import Firecrawl from '@mendable/firecrawl-js';

// Use environment variable or fallback to the provided key
const apiKey = process.env.FIRECRAWL_API_KEY || "fc-fc-95a6cd25e0b54707ad0ca88bf01e2395";

// Clean the API key - remove duplicate 'fc-' prefix if present
const cleanApiKey = apiKey.startsWith('fc-fc-') ? apiKey.replace('fc-fc-', 'fc-') : apiKey;

const firecrawl = new Firecrawl({ apiKey: cleanApiKey });

export default firecrawl;


