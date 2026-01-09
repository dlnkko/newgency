import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { generateWithCitations, callPerplexitySonarPro } from '@/lib/perplexity';

/**
 * Endpoint de ejemplo para usar Perplexity Sonar Pro para investigación
 * Este endpoint demuestra cómo usar Sonar Pro con citas para análisis profundo
 */
export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('researchPerplexity', request);
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

    const body = await request.json();
    const { query, includeCitations = true, model = 'sonar-pro' } = body;

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    let result;

    if (includeCitations) {
      // Usar función helper con citas
      const systemPrompt = `You are a research assistant. Provide detailed, accurate information with proper citations. Be thorough and analytical.`;
      
      const response = await generateWithCitations(query, systemPrompt);
      
      result = {
        content: response.content,
        citations: response.citations,
        usage: response.usage,
        model: 'sonar-pro',
      };
    } else {
      // Usar función básica sin citas
      const systemPrompt = `You are a helpful research assistant. Provide clear, accurate, and detailed answers.`;
      
      const content = await callPerplexitySonarPro(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        {
          model: model as any,
          temperature: 0.2,
          max_tokens: 4096,
        }
      );

      result = {
        content: content.choices[0].message.content,
        usage: content.usage,
        model: content.model,
      };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in Perplexity research endpoint:', error);
    
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { 
          error: 'API configuration error',
          details: 'PERPLEXITY_API_KEY is not set. Please configure it in your environment variables.'
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        error: error.message || 'Failed to process research query',
        details: error.response?.data || error.message
      },
      { status: 500 }
    );
  }
}




