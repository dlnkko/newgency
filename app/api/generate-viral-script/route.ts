import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit } from '@/lib/rate-limit';

// Helper function to get and validate API key at runtime
function getGoogleGenAI() {
  const googleApiKey = process.env.GOOGLE_GENAI_API_KEY;
  
  if (!googleApiKey) {
    throw new Error('GOOGLE_GENAI_API_KEY is not set in environment variables. Please configure it in Vercel dashboard or .env.local file.');
  }
  
  return new GoogleGenAI({ 
    apiKey: googleApiKey 
  });
}

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateViralScript', request);
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

    // Initialize AI client at runtime
    const ai = getGoogleGenAI();
    
    const body = await request.json();
    const { videoPrompt, duration } = body;

    if (!videoPrompt || !videoPrompt.trim()) {
      return NextResponse.json(
        { error: 'Video prompt is required' },
        { status: 400 }
      );
    }

    // Use gemini-3-pro-preview model
    const model = ai.getGenerativeModel({ model: 'gemini-3-pro-preview' });

    // Calculate effective duration (if duration is 1, treat as flexible)
    const effectiveDuration = duration === 1 ? null : duration;
    const durationContext = effectiveDuration 
      ? `The script must be optimized for a ${effectiveDuration}-second video. Keep it concise and impactful.`
      : 'The script length should be optimized automatically for maximum engagement.';

    const prompt = `You are an expert viral script writer specializing in UGC (User-Generated Content) marketing for products. Your scripts are designed to make viewers stop scrolling and want to buy the product.

**Context:**
- Video Description: "${videoPrompt}"
- ${durationContext}

**Your Task:**
Analyze the video description and create a viral UGC marketing script structured in 4 critical sections. The script must be designed to convert viewers into buyers.

**Script Structure:**

1. **HOOK** (The Scroll Stopper):
   - This is THE MOST IMPORTANT part - it's what makes users stop scrolling
   - Must be a bold statement, a provocative question, or an impossible premise
   - Should trigger strong emotion (curiosity, shock, desire, urgency)
   - Must be attention-grabbing and impossible to ignore
   - Examples: "I spent $500 on skincare and THIS $20 product changed everything", "What if I told you this $15 product replaced my entire morning routine?", "This product does something IMPOSSIBLE"
   - Keep it punchy, direct, and emotionally charged
   - Should immediately make the viewer think "I need to see this"

2. **PROMISE** (The High-Stakes Commitment):
   - Works hand-in-hand with the hook
   - Creates a high-stakes promise or challenge that keeps viewers watching
   - Can include time limits, challenges, or difficult-to-achieve claims
   - Should create anticipation and curiosity
   - Examples: "I'm going to show you the results in 7 days", "I challenge you to find a better product under $30", "This will either work or I'll return it - watch what happens"
   - Should make viewers think "I need to see if this is real" or "I need to see if they can deliver"
   - Creates a "will they or won't they" tension

3. **BODY** (The Product Story):
   - Quick, engaging content about the product
   - Showcases the product's value, benefits, and features
   - Should build desire and demonstrate why the product is special
   - Keep it fast-paced and engaging
   - Focus on benefits that matter to the target audience
   - Can include demonstrations, comparisons, or testimonials
   - Should make the viewer think "I want this" or "I need this"
   - Maintains momentum from the hook and promise

4. **PAYOFF** (The Conversion Moment):
   - Delivers on the promise made in the hook
   - Shows results, fulfillment, or proof
   - Should satisfy the curiosity created by the hook and promise
   - Creates urgency or desire to purchase
   - Can include call-to-action, limited-time offers, or final compelling reason to buy
   - Should make the viewer think "I need to buy this now"
   - This is where the conversion happens

**Critical Requirements:**
- The script MUST be focused on UGC marketing and product sales
- Every section should work together to drive purchase intent
- The hook is the most critical - it must be impossible to scroll past
- The promise must create genuine curiosity and anticipation
- The body should quickly build desire for the product
- The payoff must deliver satisfaction and drive action
- The entire script should feel authentic, like a real person sharing their experience
- Use natural, conversational language (not overly salesy)
- Make it feel genuine and relatable
- Optimize for the specified duration (if provided)
- The script should make viewers want to buy the product

**Output Format:**
Provide your response EXACTLY in this format (use these exact section headers):

**HOOK:**
[Your hook here - the scroll stopper]

**PROMISE:**
[Your promise here - the high-stakes commitment]

**BODY:**
[Your body here - the product story]

**PAYOFF:**
[Your payoff here - the conversion moment]

Make sure each section is compelling, conversion-focused, and designed to make viewers want to buy the product.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const scriptText = response.text();

    // Parse the response to extract each section
    const hookMatch = scriptText.match(/\*\*HOOK:\*\*\s*(.*?)(?=\*\*PROMISE:\*\*|\*\*BODY:\*\*|\*\*PAYOFF:\*\*|$)/is);
    const promiseMatch = scriptText.match(/\*\*PROMISE:\*\*\s*(.*?)(?=\*\*BODY:\*\*|\*\*PAYOFF:\*\*|$)/is);
    const bodyMatch = scriptText.match(/\*\*BODY:\*\*\s*(.*?)(?=\*\*PAYOFF:\*\*|$)/is);
    const payoffMatch = scriptText.match(/\*\*PAYOFF:\*\*\s*(.*?)$/is);

    // Extract text, handling both markdown and plain text formats
    const extractText = (match: RegExpMatchArray | null): string => {
      if (!match) return '';
      let text = match[1].trim();
      // Remove markdown formatting if present
      text = text.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      return text;
    };

    const script: {
      hook: string;
      promise: string;
      body: string;
      payoff: string;
    } = {
      hook: extractText(hookMatch),
      promise: extractText(promiseMatch),
      body: extractText(bodyMatch),
      payoff: extractText(payoffMatch),
    };

    // Validate that we got all sections
    if (!script.hook || !script.promise || !script.body || !script.payoff) {
      console.error('Failed to parse script sections. Raw response:', scriptText);
      return NextResponse.json(
        { error: 'Failed to generate complete script. Please try again.' },
        { status: 500 }
      );
    }

    // Calculate costs (for backend logging only)
    const usageMetadata = response.usageMetadata;
    if (usageMetadata) {
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;
      const totalTokens = inputTokens + outputTokens;
      
      // Gemini 3 Pro pricing (as of latest update)
      // Input: $0.50 per 1M tokens, Output: $1.50 per 1M tokens
      const inputCost = (inputTokens / 1_000_000) * 0.50;
      const outputCost = (outputTokens / 1_000_000) * 1.50;
      const totalCost = inputCost + outputCost;

      console.log('=== Viral Script Generation Cost ===');
      console.log(`Input tokens: ${inputTokens.toLocaleString()}`);
      console.log(`Output tokens: ${outputTokens.toLocaleString()}`);
      console.log(`Total tokens: ${totalTokens.toLocaleString()}`);
      console.log(`Input cost: $${inputCost.toFixed(6)}`);
      console.log(`Output cost: $${outputCost.toFixed(6)}`);
      console.log(`Total cost: $${totalCost.toFixed(6)}`);
      console.log('===================================');
    }

    return NextResponse.json({
      script,
    });
  } catch (error: any) {
    console.error('Error generating viral script:', error);
    
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'API configuration error. Please check your environment variables.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate viral script' },
      { status: 500 }
    );
  }
}

