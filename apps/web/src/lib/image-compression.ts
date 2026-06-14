/**
 * Compresses an image file client-side using HTML5 Canvas.
 * Resizes the image to fit within maxDimension and outputs it as a JPEG at the specified quality.
 */
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<File> {
  // Only compress image files
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // Skip compression for tiny files (e.g. less than 200KB) to avoid quality loss
  if (file.size < 200 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio and new dimensions
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file); // Fallback to original if canvas context cannot be created
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas back to file
        const outputMime = "image/jpeg";
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // Generate new file name with .jpg extension
            const originalName = file.name;
            const dotIndex = originalName.lastIndexOf(".");
            const baseName = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
            const newName = `${baseName}.jpg`;

            const compressedFile = new File([blob], newName, {
              type: outputMime,
              lastModified: Date.now(),
            });

            // Return original file if the compressed version is somehow larger
            if (compressedFile.size >= file.size) {
              resolve(file);
            } else {
              resolve(compressedFile);
            }
          },
          outputMime,
          quality
        );
      };

      img.onerror = () => {
        resolve(file); // Fallback on image load error
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      resolve(file); // Fallback on reader error
    };

    reader.readAsDataURL(file);
  });
}
