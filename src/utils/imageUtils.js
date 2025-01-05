export const validateImageFile = (file) => {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload a JPEG, PNG, or GIF image.');
  }

  if (file.size > maxSize) {
    throw new Error('File size too large. Maximum size is 5MB.');
  }

  return true;
};

export const createImageUrl = (file) => {
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(file);
      resolve(url);
    } catch (error) {
      reject(new Error('Failed to create image URL.'));
    }
  });
};

export const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = url;
  });
};

export const calculateImageDimensions = (image, calibrationLength, pixelLength) => {
  const metersPerPixel = calibrationLength / pixelLength;
  const width = image.width * metersPerPixel;
  const height = image.height * metersPerPixel;

  return {
    width,
    height,
    metersPerPixel
  };
};

export const revokeImageUrl = (url) => {
  if (url) {
    URL.revokeObjectURL(url);
  }
}; 