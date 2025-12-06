// Upload files to Cloudinary using base64 or data URL
exports.uploadFile = async (req, res, next) => {
  try {
    const { fileData, fileName, fileType } = req.body;

    console.log('[UPLOAD] uploadFile called', {
      fileName: fileName,
      fileType: fileType,
      hasFileData: !!fileData,
      fileDataLength: fileData ? fileData.length : 0,
      fileDataPreview: fileData ? fileData.substring(0, 50) + '...' : 'none',
    });

    if (!fileData || !fileName) {
      console.error('[UPLOAD] Missing required fields', {
        hasFileData: !!fileData,
        hasFileName: !!fileName,
      });
      return res.status(400).json({ message: 'File data and name are required' });
    }

    const cloudinary = require('cloudinary').v2;
    
    // Configure Cloudinary
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_SECRET_KEY;

    console.log('[UPLOAD] Cloudinary configuration check', {
      hasCloudName: !!cloudName,
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
    });

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('[UPLOAD] Cloudinary credentials missing');
      return res.status(500).json({ message: 'Cloudinary is not configured on the server' });
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    console.log('[UPLOAD] Starting Cloudinary upload', {
      fileName: fileName,
      fileType: fileType,
      resourceType: 'auto',
      folder: 'mail-attachments',
    });

    // Upload to Cloudinary
    // fileData should be base64 string with data URL format: "data:image/png;base64,..."
    const uploadStartTime = Date.now();
    const result = await cloudinary.uploader.upload(fileData, {
      resource_type: 'auto',
      folder: 'mail-attachments',
      use_filename: true,
      unique_filename: true,
    });
    const uploadDuration = Date.now() - uploadStartTime;

    console.log('[UPLOAD] Cloudinary upload successful', {
      fileName: fileName,
      publicId: result.public_id,
      secureUrl: result.secure_url,
      fileSize: result.bytes,
      fileType: result.resource_type,
      format: result.format,
      width: result.width,
      height: result.height,
      uploadDuration: `${uploadDuration}ms`,
      uploadedAt: new Date().toISOString(),
    });

    const responseData = {
      url: result.secure_url,
      publicId: result.public_id,
      fileName: fileName,
      fileSize: result.bytes,
      fileType: result.resource_type,
    };

    console.log('[UPLOAD] Returning upload response', {
      fileName: fileName,
      url: result.secure_url,
    });

    res.json(responseData);
  } catch (error) {
    console.error('[UPLOAD] Cloudinary upload error', {
      fileName: req.body?.fileName || 'unknown',
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
      errorHttpCode: error?.http_code,
      errorResponse: error?.response,
    });
    res.status(500).json({ message: 'Failed to upload file', error: error.message });
  }
};

exports.uploadMultipleFiles = async (req, res, next) => {
  try {
    const { files } = req.body; // Array of { fileData, fileName, fileType }

    console.log('[UPLOAD] uploadMultipleFiles called', {
      filesCount: files ? files.length : 0,
      files: files ? files.map(f => ({ fileName: f.fileName, fileType: f.fileType, hasData: !!f.fileData })) : [],
    });

    if (!files || !Array.isArray(files) || files.length === 0) {
      console.error('[UPLOAD] Invalid files array', {
        hasFiles: !!files,
        isArray: Array.isArray(files),
        length: files?.length || 0,
      });
      return res.status(400).json({ message: 'Files array is required' });
    }

    const cloudinary = require('cloudinary').v2;
    
    // Configure Cloudinary
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_SECRET_KEY;

    console.log('[UPLOAD] Cloudinary configuration check for multiple files', {
      hasCloudName: !!cloudName,
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
    });

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('[UPLOAD] Cloudinary credentials missing for multiple files');
      return res.status(500).json({ message: 'Cloudinary is not configured on the server' });
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    console.log('[UPLOAD] Starting multiple file uploads to Cloudinary', {
      totalFiles: files.length,
      folder: 'mail-attachments',
    });

    const uploadStartTime = Date.now();
    const uploadPromises = files.map(async (file, index) => {
      try {
        if (!file.fileData || !file.fileName) {
          console.warn(`[UPLOAD] File ${index + 1} missing data or name`, {
            hasFileData: !!file.fileData,
            hasFileName: !!file.fileName,
          });
          return null;
        }

        console.log(`[UPLOAD] Uploading file ${index + 1}/${files.length} to Cloudinary`, {
          fileName: file.fileName,
          fileType: file.fileType,
          fileDataLength: file.fileData.length,
        });

        const fileUploadStartTime = Date.now();
        const result = await cloudinary.uploader.upload(file.fileData, {
          resource_type: 'auto',
          folder: 'mail-attachments',
          use_filename: true,
          unique_filename: true,
        });
        const fileUploadDuration = Date.now() - fileUploadStartTime;

        console.log(`[UPLOAD] File ${index + 1}/${files.length} uploaded successfully to Cloudinary`, {
          fileName: file.fileName,
          publicId: result.public_id,
          secureUrl: result.secure_url,
          fileSize: result.bytes,
          fileType: result.resource_type,
          format: result.format,
          uploadDuration: `${fileUploadDuration}ms`,
          uploadedAt: new Date().toISOString(),
        });

        return {
          url: result.secure_url,
          publicId: result.public_id,
          fileName: file.fileName,
          fileSize: result.bytes,
          fileType: result.resource_type,
        };
      } catch (error) {
        console.error(`[UPLOAD] Error uploading file ${index + 1}/${files.length} (${file.fileName}) to Cloudinary`, {
          fileName: file.fileName,
          errorName: error?.name,
          errorMessage: error?.message,
          errorHttpCode: error?.http_code,
          errorResponse: error?.response,
          errorStack: error?.stack,
        });
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    const successfulUploads = results.filter(result => result !== null);
    const totalUploadDuration = Date.now() - uploadStartTime;

    console.log('[UPLOAD] Multiple files upload completed', {
      totalFiles: files.length,
      successfulUploads: successfulUploads.length,
      failedUploads: files.length - successfulUploads.length,
      totalUploadDuration: `${totalUploadDuration}ms`,
      uploadedFiles: successfulUploads.map(f => ({
        fileName: f.fileName,
        url: f.url,
        fileSize: f.fileSize,
      })),
    });

    res.json({
      files: successfulUploads,
      total: files.length,
      successful: successfulUploads.length,
    });
  } catch (error) {
    console.error('[UPLOAD] Multiple files upload error', {
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
      filesCount: req.body?.files?.length || 0,
    });
    res.status(500).json({ message: 'Failed to upload files', error: error.message });
  }
};

