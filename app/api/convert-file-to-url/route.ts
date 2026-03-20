import { NextRequest, NextResponse } from 'next/server';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export async function POST(request: NextRequest) {
  try {
    // Check and consume user credit
    const creditError = await verifyAndConsumeCredit(request);
    if (creditError) return creditError;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid file upload' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
    }

    const ai = await getGoogleGenAI(request);

    // Upload file to Gemini Files
    let mimeType = file.type || 'image/png';
    const supported = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!supported.includes(mimeType.toLowerCase())) {
      // Best-effort: Gemini upload expects a supported mimeType; we keep the original file
      // but label it as png to avoid rejecting uploads.
      mimeType = 'image/png';
    }

    const uploaded = await ai.files.upload({
      file,
      config: { mimeType },
    });

    // Wait until ACTIVE
    const maxWaitTime = 60000;
    const checkInterval = 2000;
    const startTime = Date.now();

    let current: any = uploaded;
    const fileNameToPoll =
      current?.name || current?.uri?.split('/').pop() || '';

    if (current?.state !== 'ACTIVE') {
      while (current?.state !== 'ACTIVE') {
        if (Date.now() - startTime > maxWaitTime) {
          return NextResponse.json(
            { error: 'Timeout waiting for file to be ready' },
            { status: 500 }
          );
        }

        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        try {
          if (!fileNameToPoll) break;
          current = await ai.files.get({ name: fileNameToPoll });
        } catch {
          // Keep polling until timeout
        }
      }
    }

    const uri = current?.uri;
    if (!uri) {
      return NextResponse.json(
        { error: 'Gemini upload succeeded but missing file URI' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uri,
      mimeType: current?.mimeType || current?.type || mimeType,
      name: current?.name || file.name,
    });
  } catch (error: any) {
    if (error?.message?.includes('GOOGLE_GENAI_API_KEY')) {
      return NextResponse.json(
        {
          error: 'Google Gemini API key is not configured',
          details: 'Set GOOGLE_GENAI_API_KEY in your environment variables or account settings.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to convert file to URL' },
      { status: 500 }
    );
  }
}

