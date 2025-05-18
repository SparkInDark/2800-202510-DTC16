// services/imgupload.js
const axios = require('axios');

/**
 * Uploads an image buffer to ImgBB and returns the image URL.
 * @param {Buffer} buffer - The image buffer to upload.
 * @param {string} [originalname] - Optional image name to set on ImgBB.
 * @returns {Promise<string>} The direct URL of the uploaded image.
 * @throws {Error} If the upload fails or ImgBB returns an error.
 */
async function uploadImageToImgbb(buffer, originalname) {
    // Ensure buffer is valid and not empty
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Image buffer is empty or invalid.');
    }

    const base64 = buffer.toString('base64');
    try {
        const params = new URLSearchParams();
        params.append('key', process.env.IMGBB_API_KEY);
        params.append('image', base64);
        if (originalname) params.append('name', originalname);

        const response = await axios.post(
            'https://api.imgbb.com/1/upload',
            params,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        // Log the full response for debugging (optional)
        // console.log('ImgBB response:', response.data);

        if (response.data && response.data.data && response.data.data.url) {
            return response.data.data.url;
        } else {
            throw new Error(response.data.error?.message || 'Unknown error');
        }
    } catch (err) {
        // Log the full error for debugging
        if (err.response && err.response.data) {
            console.error('ImgBB upload failed:', err.response.data);
        } else {
            console.error('ImgBB upload failed:', err.message);
        }
        throw new Error('Image upload to ImgBB failed: ' + (err.response?.data?.error?.message || err.message));
    }
}

module.exports = { uploadImageToImgbb };
