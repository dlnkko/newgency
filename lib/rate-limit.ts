import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

// Fallback rate limiter using in-memory storage (for development or when Upstash is not configured)
class InMemoryRateLimit {
  private requests: Map<string, number[]> = new Map();

  async limit(identifier: string, limit: number, window: number): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const now = Date.now();
    const key = identifier;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const timestamps = this.requests.get(key)!;
    
    // Remove old timestamps outside the window
    const cutoff = now - window * 1000;
    const validTimestamps = timestamps.filter(ts => ts > cutoff);
    this.requests.set(key, validTimestamps);
    
    if (validTimestamps.length >= limit) {
      const oldestTimestamp = Math.min(...validTimestamps);
      const reset = Math.ceil((oldestTimestamp + window * 1000 - now) / 1000);
      return {
        success: false,
        limit,
        remaining: 0,
        reset
      };
    }
    
    // Add current request
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    
    const remaining = limit - validTimestamps.length;
    return {
      success: true,
      limit,
      remaining,
      reset: window
    };
  }
}

// Initialize rate limiter - use Upstash Redis if configured, otherwise use in-memory
let rateLimiter: any;

function getRateLimiter() {
  if (rateLimiter) {
    return rateLimiter;
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    // Use Upstash Redis for production
    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    rateLimiter = {
      analyze: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 h'), // 10 requests per hour
        analytics: true,
      }),
      generateStaticAd: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(15, '1 h'), // 15 requests per hour
        analytics: true,
      }),
      generateProductVideo: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '1 h'), // 20 requests per hour
        analytics: true,
      }),
      enhancePrompt: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '1 h'), // 30 requests per hour
        analytics: true,
      }),
      scrapeUrl: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(50, '1 h'), // 50 requests per hour
        analytics: true,
      }),
    };
  } else {
    // Use in-memory rate limiting for development
    const inMemory = new InMemoryRateLimit();
    rateLimiter = {
      analyze: {
        limit: (identifier: string) => inMemory.limit(identifier, 10, 3600), // 10 per hour
      },
      generateStaticAd: {
        limit: (identifier: string) => inMemory.limit(identifier, 15, 3600), // 15 per hour
      },
      generateProductVideo: {
        limit: (identifier: string) => inMemory.limit(identifier, 20, 3600), // 20 per hour
      },
      enhancePrompt: {
        limit: (identifier: string) => inMemory.limit(identifier, 30, 3600), // 30 per hour
      },
      scrapeUrl: {
        limit: (identifier: string) => inMemory.limit(identifier, 50, 3600), // 50 per hour
      },
    };
  }

  return rateLimiter;
}

// Get client identifier (IP address or API key if provided)
function getIdentifier(request: Request | NextRequest): string {
  // Handle both Request and NextRequest
  const headers = request instanceof Request ? request.headers : (request as any).headers || new Headers();
  
  // Try to get IP from headers (works with Vercel and most proxies)
  const forwarded = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  
  return ip;
}

// Rate limit middleware
export async function checkRateLimit(
  endpoint: 'analyze' | 'generateStaticAd' | 'generateProductVideo' | 'enhancePrompt' | 'scrapeUrl',
  request: Request | NextRequest
): Promise<{ success: boolean; limit?: number; remaining?: number; reset?: number; error?: string }> {
  try {
    const limiter = getRateLimiter();
    const identifier = getIdentifier(request);
    const result = await limiter[endpoint].limit(identifier);

    if (!result.success) {
      // Upstash returns reset as absolute timestamp, calculate seconds until reset
      const resetSeconds = result.reset > Date.now() / 1000 
        ? Math.ceil(result.reset - Date.now() / 1000)
        : result.reset; // Fallback: assume it's already seconds
      const resetTime = new Date((result.reset > Date.now() / 1000 ? result.reset : Date.now() / 1000 + result.reset) * 1000).toISOString();
      
      return {
        success: false,
        limit: result.limit,
        remaining: result.remaining || 0,
        reset: resetSeconds,
        error: `Rate limit exceeded. Please try again after ${resetSeconds} seconds (${resetTime}).`,
      };
    }

    // Calculate reset time for successful requests
    const resetSeconds = result.reset > Date.now() / 1000 
      ? Math.ceil(result.reset - Date.now() / 1000)
      : result.reset; // Fallback: assume it's already seconds

    return {
      success: true,
      limit: result.limit,
      remaining: result.remaining || 0,
      reset: resetSeconds,
    };
  } catch (error: any) {
    console.error('Rate limit error:', error);
    // On error, allow the request (fail open) but log it
    return {
      success: true,
      error: 'Rate limit check failed, allowing request',
    };
  }
}

