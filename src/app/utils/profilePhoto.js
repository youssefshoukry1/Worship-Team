// Resize from an edge around the opposite edge's midpoint, keeping the square
// inside the image. Percent coordinates survive viewport/orientation changes.
export function resizeSquareCrop(crop, edge, delta, imageWidth, imageHeight) {
  const x = crop.x * imageWidth / 100;
  const y = crop.y * imageHeight / 100;
  const size = crop.width * imageWidth / 100;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const maxSize = edge === 'n' ? Math.min(y + size, 2 * Math.min(centerX, imageWidth - centerX))
    : edge === 's' ? Math.min(imageHeight - y, 2 * Math.min(centerX, imageWidth - centerX))
      : edge === 'w' ? Math.min(x + size, 2 * Math.min(centerY, imageHeight - centerY))
        : Math.min(imageWidth - x, 2 * Math.min(centerY, imageHeight - centerY));
  const nextSize = Math.max(Math.min(48, maxSize), Math.min(maxSize, size + (edge === 'n' || edge === 'w' ? -delta : delta)));
  const nextX = edge === 'n' || edge === 's' ? centerX - nextSize / 2 : edge === 'w' ? x + size - nextSize : x;
  const nextY = edge === 'w' || edge === 'e' ? centerY - nextSize / 2 : edge === 'n' ? y + size - nextSize : y;
  return { unit: '%', x: nextX / imageWidth * 100, y: nextY / imageHeight * 100,
    width: nextSize / imageWidth * 100, height: nextSize / imageHeight * 100 };
}

// Draw straight from the source into a bounded canvas. Allocating a canvas at
// camera resolution first can exceed the canvas/memory limits of mobile devices.
export async function cropProfilePhoto(image, crop) {
  if (!image.naturalWidth || !image.naturalHeight || !crop?.width || !crop?.height) {
    throw new Error('Please wait for the photo to load and select a crop');
  }

  const sourceX = image.naturalWidth * crop.x / 100;
  const sourceY = image.naturalHeight * crop.y / 100;
  const sourceWidth = image.naturalWidth * crop.width / 100;
  const sourceHeight = image.naturalHeight * crop.height / 100;
  const scale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to process this photo');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.88));
    if (!blob) throw new Error('Unable to process this photo. Please choose another image.');
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function uploadProfilePhotoBlob(apiBase, token, blob) {
  // Some WebViews fall back to PNG when WebP encoding is unavailable.
  const mimeType = blob.type;
  const fileExt = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[mimeType];
  if (!fileExt) throw new Error('Unsupported photo format');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const urlResponse = await fetch(`${apiBase}/users/profile-photo/upload-url`, {
    method: 'POST', headers,
    body: JSON.stringify({ fileSize: blob.size, mimeType, fileExt }),
  });
  const upload = await urlResponse.json();
  if (!urlResponse.ok) throw new Error(upload.message || 'Failed to prepare photo upload');

  const uploadResponse = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=31536000, immutable' },
    body: blob,
  });
  if (!uploadResponse.ok) throw new Error('Failed to upload photo');

  const confirmation = await fetch(`${apiBase}/users/profile-photo/confirm`, {
    method: 'POST', headers, body: JSON.stringify({ fileUrl: upload.fileUrl }),
  });
  const result = await confirmation.json();
  if (!confirmation.ok || !result.profilePhoto) throw new Error(result.message || 'Failed to save photo');
  return result.profilePhoto;
}
