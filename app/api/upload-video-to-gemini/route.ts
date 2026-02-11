import { NextRequest, NextResponse } from 'next/server';
import { getGoogleGenAI } from '@/lib/gemini';
import { checkRateLimit } from '@/lib/rate-limit';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export const maxDuration = 120; // 120 seconds for video processing

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('uploadVideoToGemini', request);
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

    // Check and consume user credit
    const creditError = await verifyAndConsumeCredit(request);
    if (creditError) {
      return creditError;
    }

    // Initialize AI client at runtime (uses user's API key if configured)
    const ai = await getGoogleGenAI(request);
    
    // Get FormData from request
    let formData: FormData;
    try {
      console.log('Parsing FormData...');
      formData = await request.formData();
      console.log('FormData parsed successfully');
    } catch (formDataError: any) {
      console.error('Error parsing FormData:', {
        message: formDataError.message,
        name: formDataError.name,
        stack: process.env.NODE_ENV === 'development' ? formDataError.stack : undefined
      });
      return NextResponse.json(
        {
          error: 'Invalid request format',
          details: 'The request body is not valid FormData. Please try uploading the video again.'
        },
        { status: 400 }
      );
    }
    
    const videoFile = formData.get('video') as File;
    const imageFile = formData.get('image') as File | null;

    console.log('Video file from FormData:', {
      exists: !!videoFile,
      type: videoFile ? typeof videoFile : 'null',
      isFile: videoFile instanceof File,
      size: videoFile instanceof File ? videoFile.size : 'N/A',
      name: videoFile instanceof File ? videoFile.name : 'N/A',
      mimeType: videoFile instanceof File ? videoFile.type : 'N/A'
    });

    if (!videoFile) {
      console.error('No video file found in FormData');
      return NextResponse.json(
        { 
          error: 'Video file is required',
          details: 'No video file was found in the request. Please make sure to upload a video file.'
        },
        { status: 400 }
      );
    }

    // Validate that videoFile is actually a File object
    if (!(videoFile instanceof File)) {
      console.error('Video file is not a File instance:', {
        type: typeof videoFile,
        constructor: (videoFile as any)?.constructor?.name,
        value: videoFile
      });
      return NextResponse.json(
        { 
          error: 'Invalid video file', 
          details: 'The uploaded file is not a valid video file. Please try again.'
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (videoFile.size === 0) {
      return NextResponse.json(
        { 
          error: 'Video file is empty', 
          details: 'The uploaded video file is empty. Please upload a valid video file.'
        },
        { status: 400 }
      );
    }

    console.log(`Uploading video: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`);

    // Upload video to Gemini Files
    let videoFileResult = null;
    try {
      console.log('Uploading video to Gemini Files...');
      
      // Determine MIME type
      let videoMime = videoFile.type || 'video/mp4';
      const supportedFormats = ['video/mp4', 'video/mov', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/avi'];
      if (!supportedFormats.includes(videoMime.toLowerCase())) {
        console.log(`Converting unsupported format ${videoMime} to MP4`);
        videoMime = 'video/mp4';
      }
      
      videoFileResult = await ai.files.upload({
        file: videoFile,
        config: { mimeType: videoMime }
      });
      console.log('Video uploaded:', videoFileResult.uri);

      // Wait for file to be ACTIVE
      const maxWaitTime = 120000; // 2 minutes for videos
      const checkInterval = 3000; // Check every 3 seconds
      const startTime = Date.now();

      const waitForFile = async (file: any, fileName: string) => {
        if (file.state === 'ACTIVE') return file;
        
        while (file.state !== 'ACTIVE') {
          if (Date.now() - startTime > maxWaitTime) {
            throw new Error(`Timeout waiting for video to be ready`);
          }
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          
          try {
            const fileInfo = await ai.files.get({ name: fileName });
            file = fileInfo;
          } catch (err) {
            console.error(`Error checking file status for ${fileName}:`, err);
          }
        }
        return file;
      };

      const videoFileName = videoFileResult.name || videoFileResult.uri?.split('/').pop() || '';
      if (videoFileName) {
        videoFileResult = await waitForFile(videoFileResult, videoFileName);
        if (!videoFileResult.uri) {
          return NextResponse.json(
            { error: 'Video file is missing required URI property' },
            { status: 500 }
          );
        }
        console.log('Video file is ready:', videoFileResult.state);
      }
    } catch (uploadError: any) {
      console.error('Error uploading video:', {
        message: uploadError.message,
        status: uploadError.status,
        code: uploadError.code,
        response: uploadError.response?.data,
        stack: process.env.NODE_ENV === 'development' ? uploadError.stack : undefined
      });
      
      // Check for API key errors
      if (uploadError.message?.includes('API key') || uploadError.message?.includes('API_KEY') || uploadError.status === 401) {
        return NextResponse.json(
          { 
            error: 'Google Gemini API key is not valid', 
            details: 'The GOOGLE_GENAI_API_KEY environment variable is not valid or has expired. Please verify it in your production environment settings (Vercel dashboard → Settings → Environment Variables).'
          },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Error uploading video', 
          details: uploadError.message || 'Could not upload the video to Gemini Files',
          ...(process.env.NODE_ENV === 'development' && {
            fullError: uploadError.toString(),
            stack: uploadError.stack
          })
        },
        { status: 500 }
      );
    }

    // Upload image to Gemini Files if provided
    let imageFileResult = null;
    if (imageFile) {
      try {
        console.log('Uploading reference image to Gemini Files...');
        
        let imageMime = imageFile.type || 'image/png';
        
        // Convert unsupported formats to PNG
        const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        if (!supportedFormats.includes(imageMime.toLowerCase())) {
          console.log(`Converting unsupported format ${imageMime} to PNG`);
          imageMime = 'image/png';
        }
        
        imageFileResult = await ai.files.upload({
          file: imageFile,
          config: { mimeType: imageMime }
        });
        console.log('Reference image uploaded:', imageFileResult.uri);

        // Wait for file to be ACTIVE
        const maxWaitTime = 60000;
        const checkInterval = 2000;
        const startTime = Date.now();

        const waitForFile = async (file: any, fileName: string) => {
          if (file.state === 'ACTIVE') return file;
          
          while (file.state !== 'ACTIVE') {
            if (Date.now() - startTime > maxWaitTime) {
              throw new Error(`Timeout waiting for image to be ready`);
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            
            try {
              const fileInfo = await ai.files.get({ name: fileName });
              file = fileInfo;
            } catch (err) {
              console.error(`Error checking file status for ${fileName}:`, err);
            }
          }
          return file;
        };

        const imageFileName = imageFileResult.name || imageFileResult.uri?.split('/').pop() || '';
        if (imageFileName) {
          imageFileResult = await waitForFile(imageFileResult, imageFileName);
          if (!imageFileResult.uri) {
            throw new Error('Image file is missing required URI property');
          }
        }
      } catch (uploadError: any) {
        console.error('Error uploading image:', uploadError);
        return NextResponse.json(
          { error: 'Error uploading image to Gemini', details: uploadError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      videoFile: {
        uri: videoFileResult.uri,
        mimeType: videoFileResult.mimeType || videoFile.type || 'video/mp4'
      },
      imageFile: imageFileResult ? {
        uri: imageFileResult.uri,
        mimeType: imageFileResult.mimeType || (imageFile ? imageFile.type : 'image/png') || 'image/png'
      } : null
    });
  } catch (error: any) {
    console.error('Error in upload-video-to-gemini:', {
      message: error.message,
      name: error.name,
      status: error.status,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    // Check for API key initialization errors
    if (error.message?.includes('GOOGLE_GENAI_API_KEY') || error.message?.includes('API key')) {
      return NextResponse.json(
        {
          error: 'Google Gemini API key is not configured',
          details: 'The GOOGLE_GENAI_API_KEY environment variable is missing or invalid. Please configure it in your production environment (Vercel dashboard → Settings → Environment Variables).'
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to upload video',
        details: 'An unexpected error occurred. Please try again or contact support if the problem persists.'
      },
      { status: 500 }
    );
  }
}

