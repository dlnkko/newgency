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
    let userId: string | null = null;
    try {
      const parsed = JSON.parse(idData);
      userId = parsed.id || parsed.user_id || parsed.pk || null;
    } catch {
      const idMatch = idData.match(/"id"\s*:\s*"?(\d+)"?/i) ||
        idData.match(/"user_id"\s*:\s*"?(\d+)"?/i) ||
        idData.match(/"pk"\s*:\s*"?(\d+)"?/i) ||
        idData.match(/(\d{8,})/);
      if (idMatch) userId = idMatch[1];
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Could not find user ID. The username may not exist.' },
        { status: 404 }
      );
    }

    // Step 2: Get related profiles
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
      return NextResponse.json(
        { error: `Failed to fetch related profiles: ${relatedResponse.statusText}` },
        { status: relatedResponse.status }
      );
    }

    const relatedData = await relatedResponse.text();
    let competitors: any[] = [];
    try {
      const parsed = JSON.parse(relatedData);
      if (parsed.data?.user?.edge_related_profiles?.edges && Array.isArray(parsed.data.user.edge_related_profiles.edges)) {
        competitors = parsed.data.user.edge_related_profiles.edges
          .map((edge: any) => edge?.node)
          .filter((node: any) => node != null);
      } else if (parsed.data?.viewer?.user?.edge_related_profiles?.edges && Array.isArray(parsed.data.viewer.user.edge_related_profiles.edges)) {
        competitors = parsed.data.viewer.user.edge_related_profiles.edges
          .map((edge: any) => edge?.node)
          .filter((node: any) => node != null);
      } else if (Array.isArray(parsed)) {
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
        competitors = parsed.edges.map((edge: any) => edge?.node).filter((node: any) => node != null);
      } else {
        for (const key of Object.keys(parsed)) {
          if (Array.isArray(parsed[key])) {
            competitors = parsed[key];
            break;
          }
        }
      }
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse related profiles response' },
        { status: 500 }
      );
    }

    const normalizedCompetitors = competitors
      .map((comp: any) => ({
        username: comp.username || comp.user_name || comp.user?.username || '',
        full_name: comp.full_name || comp.fullname || comp.fullName || comp.user?.full_name || '',
        profile_pic_url: comp.profile_pic_url || comp.profile_pic || comp.profilePicUrl || comp.user?.profile_pic_url || '',
        id: comp.id || comp.pk || comp.user_id || comp.user?.id || '',
      }))
      .filter((c: any) => c.username && c.username.trim() !== '');

    return NextResponse.json({
      success: true,
      competitors: normalizedCompetitors,
      userId,
    });
  } catch (error: any) {
    console.error('Error researching competitors:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred while researching competitors' },
      { status: 500 }
    );
  }
}
