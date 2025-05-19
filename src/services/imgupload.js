// services/imgupload.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Initialize Google Cloud Storage client
const storage = new Storage({
    keyFilename: path.join(__dirname, '../.env-key.json'),
});
const bucketName = 'ibb_img';

/**
 * Uploads an image buffer to Google Cloud Storage and returns the public URL.
 * @param {Buffer} buffer - The image buffer to upload.
 * @param {string} originalname - The original file name.
 * @returns {Promise<string>} The public URL of the uploaded image.
 */
async function uploadImageToGCS(buffer, originalname) {
    console.log('uploadImageToGCS called with:', originalname, typeof originalname);
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Image buffer is empty or invalid.');
    }
    if (!originalname) {
        throw new Error('Original file name is required.');
    }

    // Generate a unique filename (optional: add timestamp or user ID)
    const destination = `profile-photos/${Date.now()}-${originalname}`;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(destination);

    await file.save(buffer, {
        resumable: false,
        contentType: 'auto',
        //public: true, // This line only works if GCP set to ACL permission, if it sets to bucket permission, remove!
        metadata: {
            cacheControl: 'public, max-age=31536000',
        },
    });

    // Make the file public (optional if you set public: true above)
    // await file.makePublic();  // pair with - public: true,  commented out!

    // Return the public URL
    return `https://storage.googleapis.com/${bucketName}/${destination}`;
}

module.exports = { uploadImageToGCS };

