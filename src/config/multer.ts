import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from './cloudinary';

/**
 * Multer middleware configured with Cloudinary as the storage backend.
 *
 * Automatically routes uploads to the correct Cloudinary folder based on field name:
 * - "productImages" → ecommerce/products
 * - "categoryImage" → ecommerce/categories
 * - "avatar"        → ecommerce/avatars
 * - anything else   → ecommerce/misc
 *
 * Accepts jpg, jpeg, png, webp formats; resizes to max 800×800 (maintains aspect ratio).
 */
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    let folder = 'ecommerce/misc';
    if (file.fieldname === 'productImages') folder = 'ecommerce/products';
    else if (file.fieldname === 'categoryImage') folder = 'ecommerce/categories';
    else if (file.fieldname === 'avatar') folder = 'ecommerce/avatars';

    return {
      folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 800, height: 800, crop: 'limit' }],
    };
  },
});

export const upload = multer({ storage });
