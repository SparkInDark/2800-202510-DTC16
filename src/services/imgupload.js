// services/imgupload.js
const imgbbUploader = require('imgbb-uploader');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

async function uploadImageToImgbb(buffer, originalname) {
    const base64 = buffer.toString('base64');
    try {
        const response = await imgbbUploader({
            apiKey: process.env.IMGBB_API_KEY,
            name: originalname,
            base64string: base64
        });
        if (!response || !response.url) {
            throw new Error('ImgBB did not return a valid URL.');
        }
        return response.url;
    } catch (err) {
        // Log the full error for debugging
        console.error('ImgBB upload failed:', err && err.message ? err.message : err);
        // Optionally, log the whole error object for more details
        // console.error(err);

        // Throw a custom error to be caught by your route handler
        throw new Error('Image upload to ImgBB failed: ' + (err && err.message ? err.message : 'Unknown error'));
    }
}

module.exports = { upload, uploadImageToImgbb };
