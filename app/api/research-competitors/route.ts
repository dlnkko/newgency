import { NextRequest, NextResponse } from 'next/server';

function getRapidApiKey() {
  const apiKey = process.env.RAPIDAPI_KEY;
  
  if (!apiKey) {
    throw new Error('RAPIDAPI_KEY is not set in environment variables. Please configure it in Vercel dashboard or .env.local file.');
  }
  
  return apiKey;
}

const RAPIDAPI_HOST = 'instagram-looter2.p.rapidapi.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username || !username.trim()) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Get RapidAPI key from environment
    const rapidApiKey = getRapidApiKey();

    // Step 1: Get user ID from username
    console.log(`Fetching ID for username: ${username}`);
    const idResponse = await fetch(
      `https://instagram-looter2.p.rapidapi.com/id?username=${encodeURIComponent(username.trim())}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': RAPIDAPI_HOST,
        },
      }
    );

    if (!idResponse.ok) {
      console.error('Failed to fetch user ID:', idResponse.status, idResponse.statusText);
      return NextResponse.json(
        { error: `Failed to fetch user ID: ${idResponse.statusText}` },
        { status: idResponse.status }
      );
    }

    const idData = await idResponse.text();
    console.log('ID response:', idData);

    // Parse the ID from the response
    let userId: string | null = null;
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(idData);
      userId = parsed.id || parsed.user_id || parsed.pk || null;
    } catch {
      // If not JSON, try to extract ID from text
      const idMatch = idData.match(/"id"\s*:\s*"?(\d+)"?/i) || 
                      idData.match(/"user_id"\s*:\s*"?(\d+)"?/i) ||
                      idData.match(/"pk"\s*:\s*"?(\d+)"?/i) ||
                      idData.match(/(\d{8,})/); // Match any long number
      if (idMatch) {
        userId = idMatch[1];
      }
    }

    if (!userId) {
      console.error('Could not extract user ID from response:', idData);
      return NextResponse.json(
        { error: 'Could not find user ID. The username may not exist.' },
        { status: 404 }
      );
    }

    console.log(`Found user ID: ${userId}`);

    // Step 2: Get related profiles using the ID
    console.log(`Fetching related profiles for ID: ${userId}`);
    const relatedResponse = await fetch(
      `https://instagram-looter2.p.rapidapi.com/related-profiles?id=${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': RAPIDAPI_HOST,
        },
      }
    );

    if (!relatedResponse.ok) {
      console.error('Failed to fetch related profiles:', relatedResponse.status, relatedResponse.statusText);
      return NextResponse.json(
        { error: `Failed to fetch related profiles: ${relatedResponse.statusText}` },
        { status: relatedResponse.status }
      );
    }

    const relatedData = await relatedResponse.text();
    console.log('Related profiles response length:', relatedData.length);

    // Parse the related profiles
    let competitors: any[] = [];
    try {
      const parsed = JSON.parse(relatedData);
      console.log('Parsed response structure keys:', Object.keys(parsed));
      console.log('Data structure:', parsed.data ? Object.keys(parsed.data) : 'No data');
      if (parsed.data?.user) {
        console.log('User structure:', Object.keys(parsed.data.user));
        if (parsed.data.user.edge_related_profiles) {
          console.log('edge_related_profiles structure:', Object.keys(parsed.data.user.edge_related_profiles));
          console.log('edges length:', parsed.data.user.edge_related_profiles.edges?.length || 0);
          if (parsed.data.user.edge_related_profiles.edges?.[0]) {
            console.log('First edge node keys:', Object.keys(parsed.data.user.edge_related_profiles.edges[0].node || {}));
            console.log('First edge node sample:', JSON.stringify(parsed.data.user.edge_related_profiles.edges[0].node, null, 2).substring(0, 500));
          }
        }
      }
      
      // Handle the nested structure: data.user.edge_related_profiles.edges (note: not data.viewer.user)
      if (parsed.data?.user?.edge_related_profiles?.edges && Array.isArray(parsed.data.user.edge_related_profiles.edges)) {
        // Extract nodes from edges array
        competitors = parsed.data.user.edge_related_profiles.edges
          .map((edge: any) => edge?.node)
          .filter((node: any) => node != null && node !== undefined);
        console.log(`Extracted ${competitors.length} competitors from data.user.edge_related_profiles.edges`);
      }
      // Also check data.viewer.user structure (fallback)
      else if (parsed.data?.viewer?.user?.edge_related_profiles?.edges && Array.isArray(parsed.data.viewer.user.edge_related_profiles.edges)) {
        competitors = parsed.data.viewer.user.edge_related_profiles.edges
          .map((edge: any) => edge?.node)
          .filter((node: any) => node != null && node !== undefined);
        console.log(`Extracted ${competitors.length} competitors from data.viewer.user.edge_related_profiles.edges`);
      }
      // Handle other possible response structures
      else if (Array.isArray(parsed)) {
        competitors = parsed;
      } else if (parsed.profiles && Array.isArray(parsed.profiles)) {
        competitors = parsed.profiles;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        competitors = parsed.data;
      } else if (parsed.users && Array.isArray(parsed.users)) {
        competitors = parsed.users;
      } else if (parsed.results && Array.isArray(parsed.results)) {
        competitors = parsed.results;
      } else if (parsed.edges && Array.isArray(parsed.edges)) {
        // Handle edges array directly
        competitors = parsed.edges
          .map((edge: any) => edge?.node)
          .filter((node: any) => node != null && node !== undefined);
      } else {
        // Try to find any array in the response
        const keys = Object.keys(parsed);
        for (const key of keys) {
          if (Array.isArray(parsed[key])) {
            competitors = parsed[key];
            break;
          }
        }
      }
    } catch (parseError) {
      console.error('Failed to parse related profiles response:', parseError);
      console.error('Response data:', relatedData.substring(0, 500));
      return NextResponse.json(
        { error: 'Failed to parse related profiles response' },
        { status: 500 }
      );
    }

    console.log(`Raw competitors before normalization: ${competitors.length}`);
    if (competitors.length > 0 && competitors[0]) {
      console.log('Sample competitor keys:', Object.keys(competitors[0]));
      console.log('Sample competitor:', JSON.stringify(competitors[0], null, 2).substring(0, 300));
    }

    // Normalize the competitor data
    const normalizedCompetitors = competitors
      .map((comp: any) => {
        // Extract username from various possible fields - username is REQUIRED
        const username = comp.username || comp.user_name || comp.user?.username || '';
        const full_name = comp.full_name || comp.fullname || comp.fullName || comp.user?.full_name || '';
        const profile_pic_url = comp.profile_pic_url || comp.profile_pic || comp.profilePicUrl || comp.user?.profile_pic_url || '';
        const id = comp.id || comp.pk || comp.user_id || comp.user?.id || '';
        
        // Log if username is missing to debug
        if (!username) {
          console.warn('Competitor missing username:', {
            keys: Object.keys(comp),
            sample: JSON.stringify(comp, null, 2).substring(0, 200)
          });
        }
        
        return {
          username,
          full_name,
          profile_pic_url,
          id,
        };
      })
      .filter((comp: any) => {
        // Only keep if username exists and is not empty
        const hasUsername = comp.username && comp.username.trim() !== '';
        if (!hasUsername) {
          console.warn('Filtering out competitor without username:', comp);
        }
        return hasUsername;
      });

    console.log(`Found ${normalizedCompetitors.length} competitors after normalization`);
    if (normalizedCompetitors.length > 0) {
      console.log('First normalized competitor:', JSON.stringify(normalizedCompetitors[0], null, 2));
    } else if (competitors.length > 0) {
      console.log('WARNING: Had competitors before normalization but none after. Sample before:', JSON.stringify(competitors[0], null, 2));
    }

    return NextResponse.json({
      success: true,
      competitors: normalizedCompetitors,
      userId: userId,
    });
  } catch (error: any) {
    console.error('Error researching competitors:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred while researching competitors' },
      { status: 500 }
    );
  }
}

