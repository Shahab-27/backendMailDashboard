// Upload files to Cloudinary using base64 or data URL
exports.uploadFile = async (req, res, next) => {
  try {
    const { fileData, fileName, fileType } = req.body;

    if (!fileData || !fileName) {
      return res.status(400).json({ message: 'File data and name are required' });
    }

    const cloudinary = require('cloudinary').v2;
    
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_SECRET_KEY,
    });

    // Upload to Cloudinary
    // fileData should be base64 string with data URL format: "data:image/png;base64,..."
    const result = await cloudinary.uploader.upload(fileData, {
      resource_type: 'auto',
      folder: 'mail-attachments',
      use_filename: true,
      unique_filename: true,
    });

    res.json({
      url: result.secure_url,
      publicId: result.public_id,
      fileName: fileName,
      fileSize: result.bytes,
      fileType: result.resource_type,
    });
  } catch (error) {
    console.error('[UPLOAD] Cloudinary upload error:', error);
    res.status(500).json({ message: 'Failed to upload file', error: error.message });
  }
};

exports.uploadMultipleFiles = async (req, res, next) => {
  try {
    const { files } = req.body; // Array of { fileData, fileName, fileType }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ message: 'Files array is required' });
    }

    const cloudinary = require('cloudinary').v2;
    
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_SECRET_KEY,
    });

    const uploadPromises = files.map(async (file) => {
      try {
        if (!file.fileData || !file.fileName) {
          return null;
        }

        const result = await cloudinary.uploader.upload(file.fileData, {
          resource_type: 'auto',
          folder: 'mail-attachments',
          use_filename: true,
          unique_filename: true,
        });

        return {
          url: result.secure_url,
          publicId: result.public_id,
          fileName: file.fileName,
          fileSize: result.bytes,
          fileType: result.resource_type,
        };
      } catch (error) {
        console.error(`[UPLOAD] Error uploading ${file.fileName}:`, error);
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    const successfulUploads = results.filter(result => result !== null);

    res.json({
      files: successfulUploads,
      total: files.length,
      successful: successfulUploads.length,
    });
  } catch (error) {
    console.error('[UPLOAD] Multiple files upload error:', error);
    res.status(500).json({ message: 'Failed to upload files', error: error.message });
  }
};

