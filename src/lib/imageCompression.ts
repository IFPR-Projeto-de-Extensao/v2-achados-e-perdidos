/**
 * High-Performance Client-Side Image Compression (PWA & Mobile Optimized)
 * Compresses camera photos and image uploads in real-time before saving or uploading,
 * reducing data consumption and sync latency by up to 90-95% while preserving visual clarity.
 */

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0 (default: 0.82)
  outputFormat?: "image/webp" | "image/jpeg";
}

export interface CompressedImageResult {
  base64: string;
  blob: Blob;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  savingsPercentage: number;
  width: number;
  height: number;
  formattedOriginalSize: string;
  formattedCompressedSize: string;
}

// Formats bytes to human-readable string (e.g., 2.4 MB, 180 KB)
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Calculates aspect-ratio constrained target dimensions
 */
function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = srcWidth;
  let height = srcHeight;

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height);
    height = maxHeight;
  }

  return { width, height };
}

/**
 * Compresses an image File or Base64 data URL via HTML5 Canvas
 */
export async function compressImage(
  input: File | Blob | string,
  options: ImageCompressionOptions = {}
): Promise<CompressedImageResult> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.82,
    outputFormat = "image/webp",
  } = options;

  let originalSizeBytes = 0;
  let dataUrlSrc = "";

  if (typeof input === "string") {
    dataUrlSrc = input;
    // Estimate original bytes from base64 string length
    const headLength = input.indexOf(",") + 1;
    const base64Data = input.substring(headLength);
    originalSizeBytes = Math.round((base64Data.length * 3) / 4);
  } else {
    originalSizeBytes = input.size;
    dataUrlSrc = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(input);
    });
  }

  return new Promise<CompressedImageResult>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const { width, height } = calculateTargetDimensions(
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          maxWidth,
          maxHeight
        );

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
          throw new Error("Não foi possível criar o contexto 2D do Canvas para compressão.");
        }

        // Apply high quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Fill white background in case of transparent PNG conversion
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);

        // Draw resized image
        ctx.drawImage(img, 0, 0, width, height);

        // Check if browser supports WebP output format, otherwise fallback to JPEG
        let targetMimeType = outputFormat;
        let compressedBase64 = canvas.toDataURL(targetMimeType, quality);

        // If WebP is not supported or results in raw image/png fallback
        if (targetMimeType === "image/webp" && compressedBase64.startsWith("data:image/png")) {
          targetMimeType = "image/jpeg";
          compressedBase64 = canvas.toDataURL("image/jpeg", quality);
        }

        // Calculate compressed size
        const headLength = compressedBase64.indexOf(",") + 1;
        const b64Data = compressedBase64.substring(headLength);
        const compressedSizeBytes = Math.round((b64Data.length * 3) / 4);

        // Calculate savings percentage
        const savingsRatio = originalSizeBytes > 0
          ? Math.max(0, Math.min(99, Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100)))
          : 0;

        // Convert base64 to Blob
        const byteCharacters = atob(b64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const compressedBlob = new Blob([byteArray], { type: targetMimeType });

        resolve({
          base64: compressedBase64,
          blob: compressedBlob,
          originalSizeBytes,
          compressedSizeBytes,
          savingsPercentage: savingsRatio,
          width,
          height,
          formattedOriginalSize: formatBytes(originalSizeBytes),
          formattedCompressedSize: formatBytes(compressedSizeBytes),
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      reject(new Error("Falha ao carregar imagem para compressão: " + err));
    };

    img.src = dataUrlSrc;
  });
}
