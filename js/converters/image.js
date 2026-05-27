/**
 * Converts images using HTML5 Canvas
 */
export async function convertImage(file, targetFormat) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                // Handle transparent backgrounds for JPG
                if (targetFormat === 'jpg' || targetFormat === 'jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }

                ctx.drawImage(img, 0, 0);

                let mimeType = `image/${targetFormat}`;
                if (targetFormat === 'jpg') mimeType = 'image/jpeg';
                if (targetFormat === 'png') mimeType = 'image/png';
                if (targetFormat === 'webp') mimeType = 'image/webp';
                if (targetFormat === 'ico') mimeType = 'image/x-icon';

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas conversion failed'));
                    }
                }, mimeType, 0.9); // 0.9 Quality
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}
