import multer from 'multer';

/**
 * In-memory multer storage for profile image uploads. We hold the file in
 * memory and stream it to Cloudinary from the controller; nothing is written
 * to disk. Single field named `image`, max 5MB, images only.
 */
export const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
}).single('image');
