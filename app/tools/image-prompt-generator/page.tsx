'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';
import InsufficientCreditsError from '@/components/InsufficientCreditsError';

type StyleType = 'hyperrealistic-ugc' | 'hyperrealistic-cinematic' | 'studio-quality' | 'design' | 'change-elements' | null;

export default function ImagePromptGenerator() {
  const [description, setDescription] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<StyleType>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState<boolean>(false);
  const [costInfo, setCostInfo] = useState<any>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [copyCameraAngle, setCopyCameraAngle] = useState<boolean>(false);
  const [copyLighting, setCopyLighting] = useState<boolean>(false);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [productPreviews, setProductPreviews] = useState<string[]>([]);
  const [characterImages, setCharacterImages] = useState<File[]>([]);
  const [characterPreviews, setCharacterPreviews] = useState<string[]>([]);
  const [elementImages, setElementImages] = useState<File[]>([]);
  const [elementPreviews, setElementPreviews] = useState<string[]>([]);
  const [veo3FirstFrame, setVeo3FirstFrame] = useState<boolean>(false);

  // Compress and resize image to reduce file size
  const compressImage = (file: File, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.85, targetSizeKB?: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // If target size is specified, try to achieve it with binary search
          const compressWithTargetSize = (currentQuality: number): Promise<File> => {
            return new Promise((resolveCompress, rejectCompress) => {
              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    rejectCompress(new Error('Failed to compress image'));
                    return;
                  }
                  
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg', // Always use JPEG for better compression
                    lastModified: Date.now(),
                  });
                  
                  // If target size is specified and we haven't reached it, try lower quality
                  if (targetSizeKB && compressedFile.size > targetSizeKB * 1024 && currentQuality > 0.3) {
                    compressWithTargetSize(Math.max(0.3, currentQuality - 0.1))
                      .then(resolveCompress)
                      .catch(rejectCompress);
                  } else {
                    resolveCompress(compressedFile);
                  }
                },
                'image/jpeg', // Always use JPEG for better compression
                currentQuality
              );
            });
          };

          if (targetSizeKB) {
            compressWithTargetSize(quality).then(resolve).catch(reject);
          } else {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }
              const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg', // Always use JPEG for better compression
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
              'image/jpeg', // Always use JPEG for better compression
            quality
          );
          }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeReferenceImage = () => {
    setReferenceImage(null);
    setReferenceImagePreview(null);
    setCopyCameraAngle(false);
    setCopyLighting(false);
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
      const newImages = [...productImages];
      const newPreviews = [...productPreviews];
      
      // Replace image at index or add new one
      if (index < newImages.length) {
        newImages[index] = file;
      } else {
        newImages.push(file);
      }
      
      // Limit to 3 images
      if (newImages.length > 3) {
        newImages.splice(3);
      }
      
      setProductImages(newImages);
      
      // Update previews
      const reader = new FileReader();
      reader.onloadend = () => {
        if (index < newPreviews.length) {
          newPreviews[index] = reader.result as string;
        } else {
          newPreviews.push(reader.result as string);
        }
        if (newPreviews.length > 3) {
          newPreviews.splice(3);
        }
        setProductPreviews(newPreviews);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCharacterImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
      const newImages = [...characterImages];
      const newPreviews = [...characterPreviews];
      
      // Replace image at index or add new one
      if (index < newImages.length) {
        newImages[index] = file;
      } else {
        newImages.push(file);
      }
      
      // Limit to 3 images
      if (newImages.length > 3) {
        newImages.splice(3);
      }
      
      setCharacterImages(newImages);
      
      // Update previews
      const reader = new FileReader();
      reader.onloadend = () => {
        if (index < newPreviews.length) {
          newPreviews[index] = reader.result as string;
        } else {
          newPreviews.push(reader.result as string);
        }
        if (newPreviews.length > 3) {
          newPreviews.splice(3);
        }
        setCharacterPreviews(newPreviews);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeProductImage = (index: number) => {
    const newImages = [...productImages];
    const newPreviews = [...productPreviews];
    newImages.splice(index, 1);
    newPreviews.splice(index, 1);
    setProductImages(newImages);
    setProductPreviews(newPreviews);
  };

  const removeCharacterImage = (index: number) => {
    const newImages = [...characterImages];
    const newPreviews = [...characterPreviews];
    newImages.splice(index, 1);
    newPreviews.splice(index, 1);
    setCharacterImages(newImages);
    setCharacterPreviews(newPreviews);
  };

  const handleElementImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
      const newImages = [...elementImages];
      const newPreviews = [...elementPreviews];
      
      // Replace image at index or add new one
      if (index < newImages.length) {
        newImages[index] = file;
      } else {
        newImages.push(file);
      }
      
      // Limit to 2 images
      if (newImages.length > 2) {
        newImages.splice(2);
      }
      
      setElementImages(newImages);
      
      // Update previews
      const reader = new FileReader();
      reader.onloadend = () => {
        if (index < newPreviews.length) {
          newPreviews[index] = reader.result as string;
        } else {
          newPreviews.push(reader.result as string);
        }
        if (newPreviews.length > 2) {
          newPreviews.splice(2);
        }
        setElementPreviews(newPreviews);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeElementImage = (index: number) => {
    const newImages = [...elementImages];
    const newPreviews = [...elementPreviews];
    newImages.splice(index, 1);
    newPreviews.splice(index, 1);
    setElementImages(newImages);
    setElementPreviews(newPreviews);
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please describe what you want the image to be about');
      return;
    }

    if (!selectedStyle) {
      setError('Please select a style (Hyperrealistic UGC, Hyperrealistic Cinematic, Studio Quality, Design, or Change Elements in Image)');
      return;
    }

    if (selectedStyle === 'change-elements' && !referenceImage) {
      setError('Please upload a reference image for Change Elements in Image mode');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setIsInsufficientCredits(false);
    setGeneratedPrompt('');
    setCostInfo(null);

    try {
      // Calculate total number of images to determine compression strategy
      const totalImages = (referenceImage ? 1 : 0) + productImages.length + characterImages.length + elementImages.length;
      
      // More aggressive compression when multiple images
      // Target size per image: smaller when there are more images
      const maxSizePerImageKB = totalImages > 3 ? 400 : totalImages > 1 ? 600 : 800; // 400KB, 600KB, or 800KB per image
      const maxSizeBytes = maxSizePerImageKB * 1024;
      
      // Total request body limit (3.5MB to stay under Vercel's 4.5MB limit)
      const maxTotalSizeBytes = 3.5 * 1024 * 1024; // 3.5MB total for all images combined
      let totalSizeBytes = 0;

      // Convert reference image to base64 if provided
      let referenceImageBase64: string | null = null;
      
      if (referenceImage) {
        let imageToProcess = referenceImage;
        
        // Always compress reference image when there are multiple images
        if (totalImages > 1 || referenceImage.size > maxSizeBytes) {
          console.log(`Reference image size (${(referenceImage.size / 1024 / 1024).toFixed(2)}MB), compressing...`);
          try {
            // More aggressive compression for multiple images
            const targetSize = totalImages > 3 ? 300 : totalImages > 1 ? 500 : undefined;
            imageToProcess = await compressImage(referenceImage, 1280, 1280, 0.7, targetSize);
            console.log(`Compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            
            // If still too large, compress even more aggressively
            if (imageToProcess.size > maxSizeBytes) {
              console.log('Still too large, compressing more aggressively...');
              imageToProcess = await compressImage(referenceImage, 1024, 1024, 0.6, maxSizePerImageKB);
              console.log(`Re-compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            }
          } catch (compressError) {
            console.error('Error compressing reference image:', compressError);
            setError('Failed to compress reference image. Please try a smaller image file.');
            return;
          }
        }
        
        // Convert to base64
        referenceImageBase64 = await fileToBase64(imageToProcess);
        
        // Check final base64 size
        const base64Size = new Blob([referenceImageBase64]).size;
        totalSizeBytes += base64Size;
        
        if (base64Size > maxSizeBytes * 1.4) { // Base64 is ~33% larger
          setError('Reference image is too large even after compression. Please use a smaller image.');
          return;
        }
      }

      // Convert product images to base64 if provided
      const productImagesBase64: string[] = [];
      
      for (let i = 0; i < productImages.length; i++) {
        const image = productImages[i];
        let imageToProcess = image;
        
        // Always compress when there are multiple images or if image is too large
        if (totalImages > 1 || image.size > maxSizeBytes) {
          console.log(`Product image ${i + 1} size (${(image.size / 1024 / 1024).toFixed(2)}MB), compressing...`);
          try {
            // More aggressive compression for multiple images
            const targetSize = totalImages > 3 ? 300 : totalImages > 1 ? 500 : undefined;
            imageToProcess = await compressImage(image, 1280, 1280, 0.7, targetSize);
            console.log(`Compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            
            // If still too large, compress even more aggressively
            if (imageToProcess.size > maxSizeBytes) {
              console.log('Still too large, compressing more aggressively...');
              imageToProcess = await compressImage(image, 1024, 1024, 0.6, maxSizePerImageKB);
              console.log(`Re-compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            }
          } catch (compressError) {
            console.error(`Error compressing product image ${i + 1}:`, compressError);
            setError(`Failed to compress product image ${i + 1}. Please try a smaller image file.`);
            return;
          }
        }
        
        // Convert to base64
        const base64 = await fileToBase64(imageToProcess);
        
        // Check final base64 size
        const base64Size = new Blob([base64]).size;
        totalSizeBytes += base64Size;
        
        // Check if total size exceeds limit
        if (totalSizeBytes > maxTotalSizeBytes) {
          setError(`Total size of all images (${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds the limit. Please use fewer or smaller images.`);
          return;
        }
        
        if (base64Size > maxSizeBytes * 1.4) { // Base64 is ~33% larger
          setError(`Product image ${i + 1} is too large even after compression. Please use a smaller image.`);
          return;
        }
        
        productImagesBase64.push(base64);
      }

      // Convert character images to base64 if provided
      const characterImagesBase64: string[] = [];
      
      for (let i = 0; i < characterImages.length; i++) {
        const image = characterImages[i];
        let imageToProcess = image;
        
        // Always compress when there are multiple images or if image is too large
        if (totalImages > 1 || image.size > maxSizeBytes) {
          console.log(`Character image ${i + 1} size (${(image.size / 1024 / 1024).toFixed(2)}MB), compressing...`);
          try {
            // More aggressive compression for multiple images
            const targetSize = totalImages > 3 ? 300 : totalImages > 1 ? 500 : undefined;
            imageToProcess = await compressImage(image, 1280, 1280, 0.7, targetSize);
            console.log(`Compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            
            // If still too large, compress even more aggressively
            if (imageToProcess.size > maxSizeBytes) {
              console.log('Still too large, compressing more aggressively...');
              imageToProcess = await compressImage(image, 1024, 1024, 0.6, maxSizePerImageKB);
              console.log(`Re-compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            }
          } catch (compressError) {
            console.error(`Error compressing character image ${i + 1}:`, compressError);
            setError(`Failed to compress character image ${i + 1}. Please try a smaller image file.`);
            return;
          }
        }
        
        // Convert to base64
        const base64 = await fileToBase64(imageToProcess);
        
        // Check final base64 size
        const base64Size = new Blob([base64]).size;
        totalSizeBytes += base64Size;
        
        // Check if total size exceeds limit
        if (totalSizeBytes > maxTotalSizeBytes) {
          setError(`Total size of all images (${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds the limit. Please use fewer or smaller images.`);
          return;
        }
        
        if (base64Size > maxSizeBytes * 1.4) { // Base64 is ~33% larger
          setError(`Character image ${i + 1} is too large even after compression. Please use a smaller image.`);
          return;
        }
        
        characterImagesBase64.push(base64);
      }

      // Convert element images to base64 if provided
      const elementImagesBase64: string[] = [];
      
      for (let i = 0; i < elementImages.length; i++) {
        const image = elementImages[i];
        let imageToProcess = image;
        
        // Always compress when there are multiple images or if image is too large
        if (totalImages > 1 || image.size > maxSizeBytes) {
          console.log(`Element image ${i + 1} size (${(image.size / 1024 / 1024).toFixed(2)}MB), compressing...`);
          try {
            // More aggressive compression for multiple images
            const targetSize = totalImages > 3 ? 300 : totalImages > 1 ? 500 : undefined;
            imageToProcess = await compressImage(image, 1280, 1280, 0.7, targetSize);
            console.log(`Compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            
            // If still too large, compress even more aggressively
            if (imageToProcess.size > maxSizeBytes) {
              console.log('Still too large, compressing more aggressively...');
              imageToProcess = await compressImage(image, 1024, 1024, 0.6, maxSizePerImageKB);
              console.log(`Re-compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            }
          } catch (compressError) {
            console.error(`Error compressing element image ${i + 1}:`, compressError);
            setError(`Failed to compress element image ${i + 1}. Please try a smaller image file.`);
            return;
          }
        }
        
        // Convert to base64
        const base64 = await fileToBase64(imageToProcess);
        
        // Check final base64 size
        const base64Size = new Blob([base64]).size;
        totalSizeBytes += base64Size;
        
        // Check if total size exceeds limit
        if (totalSizeBytes > maxTotalSizeBytes) {
          setError(`Total size of all images (${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds the limit. Please use fewer or smaller images.`);
          return;
        }
        
        if (base64Size > maxSizeBytes * 1.4) { // Base64 is ~33% larger
          setError(`Element image ${i + 1} is too large even after compression. Please use a smaller image.`);
          return;
        }
        
        elementImagesBase64.push(base64);
      }
      
      // Final check of total size
      if (totalSizeBytes > maxTotalSizeBytes) {
        setError(`Total size of all images (${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds the limit of ${(maxTotalSizeBytes / 1024 / 1024).toFixed(2)}MB. Please use fewer or smaller images.`);
        return;
      }

      const response = await fetch('/api/generate-image-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: description.trim(),
          style: selectedStyle,
          referenceImage: referenceImageBase64,
          copyCameraAngle: copyCameraAngle,
          copyLighting: copyLighting,
          productImages: productImagesBase64,
          characterImages: characterImagesBase64,
          elementImages: elementImagesBase64,
          firstFrameFromVideo: veo3FirstFrame
        }),
      });

      // Check if response is ok before parsing JSON
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          // If response is not JSON, use status text
          const statusText = response.statusText || 'Unknown error';
          setError(`Error ${response.status}: ${statusText}`);
          setIsInsufficientCredits(false);
          return;
        }

        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
        } else if (response.status === 429) {
          setError(`Rate limit exceeded. ${errorData.details || 'Please try again later.'}`);
          setIsInsufficientCredits(false);
        } else {
          // Show detailed error message if available
          const errorMessage = errorData.error || 'Failed to generate prompt';
          const errorDetails = errorData.details ? `\n\nDetails: ${errorData.details}` : '';
          setError(`${errorMessage}${errorDetails}`);
          setIsInsufficientCredits(false);
        }
        return;
      }

      // Parse JSON response
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        setError('Invalid response from server. Please try again.');
        console.error('Error parsing JSON response:', jsonError);
        return;
      }

      if (!data.prompt) {
        setError('No prompt was generated. Please try again.');
        return;
      }

      setGeneratedPrompt(data.prompt || '');
      setCostInfo(data.usage);
    } catch (err: any) {
      console.error('Error generating prompt:', err);
      
      // Provide more descriptive error messages
      let errorMessage = 'An error occurred while generating the prompt';
      
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.response?.status === 400) {
        errorMessage = 'Invalid request. Please check your input and try again.';
      } else if (err?.response?.status === 401) {
        errorMessage = 'Authentication error. Please check your API configuration.';
      } else if (err?.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (err?.response?.status === 500) {
        errorMessage = 'Server error. Please try again or contact support if the problem persists.';
      } else if (err?.response?.status === 504) {
        errorMessage = 'Request timeout. The image may be too large. Please try with a smaller image.';
      } else if (err?.name === 'NetworkError' || err?.message?.includes('network') || err?.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (err?.message?.includes('image') || err?.message?.includes('Image')) {
        errorMessage = `Image error: ${err.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-zinc-50 sm:text-4xl">
            Image Prompt Generator
          </h1>
          <p className="text-sm text-zinc-400 sm:text-base">
            Describe what you want the image to be about and select a style. Get a detailed, professional prompt optimized for AI image generation.
          </p>
        </div>

        {/* Description Input */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            What should the image be about?
          </label>
          {/* Veo 3 toggle (first frame from video prompt) */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-500">
              If your text is a video-style prompt (scenes, hook, concept), enable Veo 3 to generate an image prompt for the first frame.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Veo 3</span>
              <button
                onClick={() => setVeo3FirstFrame(!veo3FirstFrame)}
                disabled={isGenerating}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                  veo3FirstFrame ? 'bg-amber-500/80' : 'bg-zinc-700/50'
                }`}
                title="If ON, generate an image prompt representing the first frame of the described video."
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    veo3FirstFrame ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-xs font-medium ${veo3FirstFrame ? 'text-amber-400' : 'text-zinc-500'}`}>
                {veo3FirstFrame ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={selectedStyle === 'change-elements' 
              ? "Describe what you want to change or make different in the reference image. For example: 'Replace the product with my product', 'Change the person with my character', 'Keep everything the same but swap the elements'"
              : "Describe what you want in the image. For example: 'A person using headphones while exercising in a gym', 'A skincare product on a bathroom counter with natural lighting', 'An infographic showing the benefits of a supplement'"}
            rows={6}
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
        </div>

        {/* Style Selection */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Select Style
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <button
              onClick={() => setSelectedStyle('hyperrealistic-ugc')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'hyperrealistic-ugc'
                  ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 shadow-[0_0_30px_rgba(250,204,21,0.2)] ring-1 ring-amber-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-amber-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">📱</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Hyperrealistic UGC</h3>
              <p className="text-xs text-zinc-400">
                iPhone-style hyperrealism with authentic shadows, lights, textures, and colors. Perfect for UGC-style content that looks like real phone photos.
              </p>
            </button>

            <button
              onClick={() => setSelectedStyle('hyperrealistic-cinematic')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'hyperrealistic-cinematic'
                  ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 shadow-[0_0_30px_rgba(250,204,21,0.2)] ring-1 ring-amber-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-amber-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">🎬</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Hyperrealistic Cinematic</h3>
              <p className="text-xs text-zinc-400">
                Cinematic hyperrealism with professional camera quality, dramatic lighting, and film-like aesthetics. Perfect for high-production, cinematic visuals.
              </p>
            </button>

            <button
              onClick={() => setSelectedStyle('studio-quality')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'studio-quality'
                  ? 'border-blue-500/80 bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-blue-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">📸</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Studio Quality</h3>
              <p className="text-xs text-zinc-400">
                Professional photography style with artificial lighting, clarity, and detail. Like photos taken in a professional studio.
              </p>
            </button>

            <button
              onClick={() => setSelectedStyle('design')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'design'
                  ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-purple-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">🎨</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Design</h3>
              <p className="text-xs text-zinc-400">
                Creative designs like infographics or static ads. Human-made quality with attention to every detail, colors, and composition.
              </p>
            </button>

            <button
              onClick={() => setSelectedStyle('change-elements')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'change-elements'
                  ? 'border-green-500/80 bg-gradient-to-br from-green-500/20 to-green-500/10 shadow-[0_0_30px_rgba(34,197,94,0.2)] ring-1 ring-green-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-green-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">🔄</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Change Elements in Image</h3>
              <p className="text-xs text-zinc-400">
                Upload a base image and elements to replace. The AI will create the same image but with your elements in place of the original ones.
              </p>
            </button>
          </div>
        </div>

        {/* Reference Image Upload (for design, studio-quality, hyperrealistic variants, and change-elements) */}
        {(selectedStyle === 'design' || selectedStyle === 'studio-quality' || selectedStyle === 'hyperrealistic-ugc' || selectedStyle === 'hyperrealistic-cinematic' || selectedStyle === 'change-elements') && (
          <div className="mb-8">
            <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
              {selectedStyle === 'change-elements' ? 'Image to Change Elements' : 'Reference Image'}
            </label>
            <p className="mb-3 text-xs text-zinc-400">
              {selectedStyle === 'hyperrealistic-ugc' 
                ? 'Upload a reference image that defines the UGC style (lighting, angle, iPhone-style hyperrealism). This image will be uploaded to Nano Banana Pro model and placed first. The generated prompt will specify that the result must match this exact UGC style, angle, lighting, and iPhone-style hyperrealism level.'
                : selectedStyle === 'hyperrealistic-cinematic'
                ? 'Upload a reference image that defines the cinematic style (lighting, angle, cinematic hyperrealism). This image will be uploaded to Nano Banana Pro model and placed first. The generated prompt will specify that the result must match this exact cinematic style, angle, lighting, and cinematic hyperrealism level.'
                : selectedStyle === 'studio-quality'
                ? 'Upload a reference image that defines the style (lighting, composition, professional quality). This image will be uploaded to Nano Banana Pro model and placed first. The generated prompt will specify that the result must match this exact style, lighting, and professional quality.'
                : selectedStyle === 'change-elements'
                ? 'Upload the base image where you want to change elements. This image will be uploaded to Nano Banana Pro model and placed first. Then upload the elements you want to replace in the "Elements" section below.'
                : 'Upload a reference image that defines the design style (colors, typography, composition). This image will be uploaded to Nano Banana Pro model and placed first. The generated prompt will specify that the result must match this exact design style, colors, and visual aesthetics.'}
            </p>
            <div className="max-w-md">
              {referenceImagePreview ? (
                <div className="space-y-3">
                <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                  <div className="relative inline-block w-full">
                    <img
                      src={referenceImagePreview}
                      alt="Reference image preview"
                      className="w-full max-h-64 rounded-lg object-contain"
                    />
                    <button
                      onClick={removeReferenceImage}
                      disabled={isGenerating}
                      className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Remove image"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      </button>
                    </div>
                  </div>
                  {/* Copy Options */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCopyCameraAngle(!copyCameraAngle)}
                      disabled={isGenerating}
                      className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                        copyCameraAngle
                          ? 'bg-blue-500/80 text-white shadow-lg shadow-blue-500/20'
                          : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700/70'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      Copy Camera Angle
                    </button>
                    <button
                      onClick={() => setCopyLighting(!copyLighting)}
                      disabled={isGenerating}
                      className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                        copyLighting
                          ? 'bg-amber-500/80 text-white shadow-lg shadow-amber-500/20'
                          : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700/70'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      Copy Lighting
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-4 py-6 text-center transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
                  <svg
                    className="mb-2 h-8 w-8 text-zinc-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-xs font-medium text-zinc-400">
                    Upload Reference Image
                  </span>
                  <span className="mt-1 text-[10px] text-zinc-500">
                    PNG, JPG, WEBP
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleReferenceImageUpload}
                    className="hidden"
                    disabled={isGenerating}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Elements Upload (for change-elements only) */}
        {selectedStyle === 'change-elements' && (
          <div className="mb-8">
            <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
              Elements (Up to 2)
            </label>
            <p className="mb-3 text-xs text-zinc-400">
              Upload up to 2 element images that you want to replace in the base image. For example, if the base image has a product, upload your product image here to replace it.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1].map((index) => (
                <div key={index} className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    {index === 0 ? 'Element 1' : 'Element 2'}
                  </label>
                  {elementPreviews[index] ? (
                    <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                      <div className="relative inline-block w-full">
                        <img
                          src={elementPreviews[index]}
                          alt={`Element ${index + 1} preview`}
                          className="w-full max-h-48 rounded-lg object-contain"
                        />
                        <button
                          onClick={() => removeElementImage(index)}
                          disabled={isGenerating}
                          className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove image"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-4 py-6 text-center transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
                      <svg
                        className="mb-2 h-8 w-8 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-zinc-400">
                        Upload
                      </span>
                      <span className="mt-1 text-[10px] text-zinc-500">
                        PNG, JPG, WEBP
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={(e) => handleElementImageUpload(e, index)}
                        className="hidden"
                        disabled={isGenerating}
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Images Upload (for design, studio-quality, hyperrealistic) */}
        {(selectedStyle === 'design' || selectedStyle === 'studio-quality' || selectedStyle === 'hyperrealistic') && (
          <div className="mb-8">
            <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
              Product (Optional - Up to 3)
            </label>
            <p className="mb-3 text-xs text-zinc-400">
              Upload up to 3 product images. These will be attached to the prompt and referenced as "the attached product image".
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    {index === 0 ? 'Product 1' : index === 1 ? 'Product 2' : 'Product 3'}
                  </label>
                  {productPreviews[index] ? (
                    <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                      <div className="relative inline-block w-full">
                        <img
                          src={productPreviews[index]}
                          alt={`Product ${index + 1} preview`}
                          className="w-full max-h-48 rounded-lg object-contain"
                        />
                        <button
                          onClick={() => removeProductImage(index)}
                          disabled={isGenerating}
                          className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove image"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-4 py-6 text-center transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
                      <svg
                        className="mb-2 h-8 w-8 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-zinc-400">
                        Upload
                      </span>
                      <span className="mt-1 text-[10px] text-zinc-500">
                        PNG, JPG, WEBP
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={(e) => handleProductImageUpload(e, index)}
                        className="hidden"
                        disabled={isGenerating}
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Character Images Upload (for design, studio-quality, hyperrealistic) */}
        {(selectedStyle === 'design' || selectedStyle === 'studio-quality' || selectedStyle === 'hyperrealistic') && (
          <div className="mb-8">
            <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
              Characters (Optional - Up to 3)
            </label>
            <p className="mb-3 text-xs text-zinc-400">
              Upload up to 3 character images. These will be attached to the prompt and used as character references.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    {index === 0 ? 'Character 1' : index === 1 ? 'Character 2' : 'Character 3'}
                  </label>
                  {characterPreviews[index] ? (
                    <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                      <div className="relative inline-block w-full">
                        <img
                          src={characterPreviews[index]}
                          alt={`Character ${index + 1} preview`}
                          className="w-full max-h-48 rounded-lg object-contain"
                        />
                        <button
                          onClick={() => removeCharacterImage(index)}
                          disabled={isGenerating}
                          className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove image"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-4 py-6 text-center transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
                      <svg
                        className="mb-2 h-8 w-8 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-zinc-400">
                        Upload
                      </span>
                      <span className="mt-1 text-[10px] text-zinc-500">
                        PNG, JPG, WEBP
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={(e) => handleCharacterImageUpload(e, index)}
                        className="hidden"
                        disabled={isGenerating}
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !description.trim() || !selectedStyle}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_30px_rgba(250,204,21,0.4)] transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_0_40px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-amber-600"
          >
            {isGenerating ? 'Generating Prompt...' : 'Generate Prompt'}
          </button>
        </div>

        {/* Insufficient Credits Error */}
        {isInsufficientCredits && (
          <div className="mb-6">
            <InsufficientCreditsError />
          </div>
        )}

        {/* Error Message */}
        {error && !isInsufficientCredits && (
          <div className="mb-6 rounded-xl border-2 border-red-500/50 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Generated Prompt */}
        {generatedPrompt && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-zinc-50">
                Generated Prompt
              </h2>
            </div>

            <div className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6 shadow-[0_0_30px_rgba(250,204,21,0.15)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide text-amber-400">
                    {selectedStyle === 'hyperrealistic' && 'Hyperrealistic Image Prompt'}
                    {selectedStyle === 'studio-quality' && 'Studio Quality Image Prompt'}
                    {selectedStyle === 'design' && 'Design Image Prompt'}
                    {selectedStyle === 'change-elements' && 'Change Elements in Image Prompt'}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Style: {selectedStyle === 'hyperrealistic' && 'Hyperrealistic'}
                    {selectedStyle === 'studio-quality' && 'Studio Quality'}
                    {selectedStyle === 'design' && 'Design'}
                    {selectedStyle === 'change-elements' && 'Change Elements in Image'}
                  </p>
                </div>
                <CopyButton
                  text={generatedPrompt}
                  label="Copy Prompt"
                  copiedLabel="Copied!"
                />
              </div>

              <div className="prose prose-invert max-w-none">
                <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                  {generatedPrompt}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

