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
      cloudNamePreview: cloudName ? `${cloudName.substring(0, 4)}...` : 'missing',
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
    });

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('[UPLOAD] Cloudinary credentials missing', {
        missingCloudName: !cloudName,
        missingApiKey: !apiKey,
        missingApiSecret: !apiSecret,
      });
      return res.status(500).json({ 
        message: 'Cloudinary is not configured on the server',
        details: 'Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_SECRET_KEY environment variables'
      });
    }

    // Validate cloud_name format (must be lowercase alphanumeric with hyphens)
    const cloudNamePattern = /^[a-z0-9-]+$/;
    if (!cloudNamePattern.test(cloudName)) {
      console.error('[UPLOAD] Invalid cloud_name format', {
        cloudName: cloudName,
        error: 'Cloud name must be lowercase alphanumeric characters and hyphens only',
      });
      return res.status(500).json({ 
        message: 'Invalid Cloudinary cloud name format',
        details: `Cloud name "${cloudName}" is invalid. Cloud names must be lowercase alphanumeric characters and hyphens only (e.g., "my-cloud-name"). Please check your CLOUDINARY_CLOUD_NAME environment variable.`
      });
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

    console.log('[UPLOAD] ✅ Cloudinary upload SUCCESSFUL', {
      fileName: fileName,
      publicId: result.public_id,
      secureUrl: result.secure_url,
      fileSize: result.bytes,
      fileSizeFormatted: `${(result.bytes / 1024).toFixed(2)} KB`,
      fileType: result.resource_type,
      format: result.format,
      width: result.width,
      height: result.height,
      uploadDuration: `${uploadDuration}ms`,
      uploadedAt: new Date().toISOString(),
      folder: result.folder || 'mail-attachments',
      version: result.version,
      signature: result.signature ? result.signature.substring(0, 10) + '...' : 'N/A',
    });
    
    console.log('[UPLOAD] 📎 File successfully uploaded to Cloudinary:', {
      'File Name': fileName,
      'Cloudinary URL': result.secure_url,
      'Public ID': result.public_id,
      'File Size': `${(result.bytes / 1024).toFixed(2)} KB`,
      'Upload Time': `${uploadDuration}ms`,
      'Status': 'SUCCESS',
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
      cloudNamePreview: cloudName ? `${cloudName.substring(0, 4)}...` : 'missing',
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
    });

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('[UPLOAD] Cloudinary credentials missing for multiple files', {
        missingCloudName: !cloudName,
        missingApiKey: !apiKey,
        missingApiSecret: !apiSecret,
      });
      return res.status(500).json({ 
        message: 'Cloudinary is not configured on the server',
        details: 'Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_SECRET_KEY environment variables'
      });
    }

    // Validate cloud_name format (must be lowercase alphanumeric with hyphens)
    const cloudNamePattern = /^[a-z0-9-]+$/;
    if (!cloudNamePattern.test(cloudName)) {
      console.error('[UPLOAD] Invalid cloud_name format for multiple files', {
        cloudName: cloudName,
        error: 'Cloud name must be lowercase alphanumeric characters and hyphens only',
      });
      return res.status(500).json({ 
        message: 'Invalid Cloudinary cloud name format',
        details: `Cloud name "${cloudName}" is invalid. Cloud names must be lowercase alphanumeric characters and hyphens only (e.g., "my-cloud-name"). Please check your CLOUDINARY_CLOUD_NAME environment variable.`
      });
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

        console.log(`[UPLOAD] ✅ File ${index + 1}/${files.length} uploaded SUCCESSFULLY to Cloudinary`, {
          fileName: file.fileName,
          publicId: result.public_id,
          secureUrl: result.secure_url,
          fileSize: result.bytes,
          fileSizeFormatted: `${(result.bytes / 1024).toFixed(2)} KB`,
          fileType: result.resource_type,
          format: result.format,
          width: result.width,
          height: result.height,
          uploadDuration: `${fileUploadDuration}ms`,
          uploadedAt: new Date().toISOString(),
          folder: result.folder || 'mail-attachments',
        });
        
        console.log(`[UPLOAD] 📎 File ${index + 1}/${files.length} successfully uploaded:`, {
          'File Name': file.fileName,
          'Cloudinary URL': result.secure_url,
          'Public ID': result.public_id,
          'File Size': `${(result.bytes / 1024).toFixed(2)} KB`,
          'Upload Time': `${fileUploadDuration}ms`,
          'Status': 'SUCCESS',
        });

        return {
          url: result.secure_url,
          publicId: result.public_id,
          fileName: file.fileName,
          fileSize: result.bytes,
          fileType: result.resource_type,
        };
      } catch (error) {
        console.error(`[UPLOAD] ❌ Error uploading file ${index + 1}/${files.length} (${file.fileName}) to Cloudinary`, {
          fileName: file.fileName,
          errorName: error?.name,
          errorMessage: error?.message,
          errorHttpCode: error?.http_code,
          errorResponse: error?.response,
          errorStack: error?.stack,
        });

        // Log specific error details for common issues
        if (error?.message?.includes('Invalid cloud_name')) {
          console.error(`[UPLOAD] ⚠️  CLOUD_NAME VALIDATION ERROR:`, {
            providedCloudName: process.env.CLOUDINARY_CLOUD_NAME,
            error: 'The cloud_name must be a valid Cloudinary cloud name (lowercase, alphanumeric, hyphens only)',
            help: 'Check your CLOUDINARY_CLOUD_NAME environment variable. It should match your Cloudinary dashboard cloud name.',
          });
        } else if (error?.http_code === 401) {
          console.error(`[UPLOAD] ⚠️  AUTHENTICATION ERROR:`, {
            error: 'Invalid API credentials or cloud name',
            help: 'Verify your CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_SECRET_KEY are correct',
          });
        }

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
    console.error('[UPLOAD] ❌ Multiple files upload error', {
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
      filesCount: req.body?.files?.length || 0,
    });

    // Provide helpful error messages for common issues
    let errorDetails = error.message;
    if (error?.message?.includes('Invalid cloud_name')) {
      errorDetails = `Invalid cloud name "${process.env.CLOUDINARY_CLOUD_NAME}". Cloud names must be lowercase alphanumeric characters and hyphens only. Please check your CLOUDINARY_CLOUD_NAME environment variable.`;
      console.error('[UPLOAD] ⚠️  CLOUD_NAME ERROR:', {
        providedCloudName: process.env.CLOUDINARY_CLOUD_NAME,
        help: 'The cloud_name should match exactly what you see in your Cloudinary dashboard',
      });
    } else if (error?.http_code === 401) {
      errorDetails = 'Authentication failed. Please verify your Cloudinary credentials are correct.';
    }

    res.status(500).json({ 
      message: 'Failed to upload files', 
      error: errorDetails,
      httpCode: error?.http_code,
    });
  }
};

