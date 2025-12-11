import { NextRequest, NextResponse } from 'next/server';
import getFirecrawlInstance from '@/lib/firecrawl';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('scrapeUrl', request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          details: rateLimitResult.error,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining,
          reset: rateLimitResult.reset,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit?.toString() || '',
            'X-RateLimit-Remaining': rateLimitResult.remaining?.toString() || '0',
            'X-RateLimit-Reset': rateLimitResult.reset?.toString() || '',
            'Retry-After': rateLimitResult.reset?.toString() || '3600',
          },
        }
      );
    }

    // Initialize Firecrawl client at runtime
    const firecrawl = getFirecrawlInstance();
    
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    console.log('Scraping URL:', url);

    // Scrape the URL with summary and branding formats
    // Try scrape method first, fallback to scrapeUrl if needed
    let doc: any;
    try {
      // Try the scrape method (as per user's example) with both summary and branding
      doc = await (firecrawl as any).scrape(url, { formats: ['summary', 'branding'] });
    } catch (scrapeError: any) {
      // If scrape doesn't work, try scrapeUrl (the actual SDK method)
      console.log('scrape method failed, trying scrapeUrl:', scrapeError.message);
      try {
        doc = await (firecrawl as any).scrapeUrl(url, { formats: ['summary', 'branding'] as any });
      } catch (scrapeUrlError: any) {
        console.error('Both methods failed:', {
          scrape: scrapeError.message,
          scrapeUrl: scrapeUrlError.message,
        });
        // Check if it's an authentication error
        if (scrapeError.status === 401 || scrapeUrlError.status === 401) {
          throw new Error('Invalid Firecrawl API key. Please check your API key configuration.');
        }
        throw scrapeUrlError;
      }
    }

    console.log('Scrape response received:', {
      hasData: !!doc.data,
      hasSummary: !!doc.data?.summary,
      hasBranding: !!doc.data?.branding,
      keys: Object.keys(doc || {}),
    });

    // Check if result is an error response
    if (doc && 'error' in doc) {
      console.error('Error in response:', doc.error);
      return NextResponse.json(
        { error: 'Failed to scrape URL', details: doc.error },
        { status: 500 }
      );
    }

    // Check if we have valid data
    if (!doc) {
      return NextResponse.json(
        { error: 'Failed to scrape URL - no response received' },
        { status: 500 }
      );
    }

    // Extract summary from the response
    // The structure should be: doc.data.summary
    const summary = doc.data?.summary || 
                    doc.summary ||
                    doc.data?.metadata?.description || 
                    doc.metadata?.description ||
                    null;

    if (!summary) {
      console.warn('No summary found in response. Full response structure:', JSON.stringify(doc, null, 2));
      return NextResponse.json(
        { 
          error: 'No summary could be extracted from the URL',
          details: 'The scraped page did not contain a summary. Please try a different URL or enter copywriting manually.'
        },
        { status: 500 }
      );
    }

    console.log('Summary extracted successfully, length:', summary.length);

    // Extract branding information
    const branding = doc.data?.branding || doc.branding || null;
    
    if (branding) {
      console.log('Branding extracted:', {
        hasColors: !!branding.colors,
        hasTypography: !!branding.typography,
        hasFonts: !!branding.fonts,
      });
    } else {
      console.log('No branding data found in response');
    }

    // Calculate Firecrawl costs (server-side only, not sent to frontend)
    // Firecrawl pricing: ~$0.02-0.05 per scrape depending on plan and formats
    // Using conservative estimate of $0.03 per scrape with summary and branding formats
    const firecrawlCostPerScrape = 0.03;
    try {
      console.log('\n=== FIRECRAWL SCRAPING COST ===');
      console.log(`URL scraped: ${url}`);
      console.log(`Formats used: summary, branding`);
      console.log(`Estimated cost: $${firecrawlCostPerScrape.toFixed(4)}`);
      console.log('Note: Actual costs may vary based on Firecrawl plan and page complexity');
    } catch (costError) {
      console.error('Error logging Firecrawl cost:', costError);
    }

    return NextResponse.json({
      success: true,
      summary: summary,
      branding: branding,
      metadata: doc.data?.metadata || doc.metadata || null,
    });

  } catch (error: any) {
    console.error('Error scraping URL:', error);
    
    // Handle specific error types
    let errorMessage = error.message || 'Unknown error';
    let statusCode = 500;
    
    if (error.status === 401 || error.code === 'ERR_BAD_REQUEST' || errorMessage.includes('Invalid token') || errorMessage.includes('Unauthorized')) {
      errorMessage = 'Invalid Firecrawl API key. Please check your API key in lib/firecrawl.ts';
      statusCode = 401;
    } else if (error.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
      statusCode = 429;
    } else if (error.status === 404) {
      errorMessage = 'URL not found or could not be accessed.';
      statusCode = 404;
    }
    
    return NextResponse.json(
      {
        error: 'Failed to scrape URL',
        details: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { 
          fullError: error.toString(),
          stack: error.stack 
        })
      },
      { status: statusCode }
    );
  }
}