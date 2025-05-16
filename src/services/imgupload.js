// services/imgupload.js
const imgbbUploader = require('imgbb-uploader');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

async function uploadImageToImgbb(buffer, originalname) {
    const base64 = buffer.toString('base64');
    const response = await imgbbUploader({
        apiKey: process.env.IMGBB_API_KEY,
        name: originalname,
        base64string: base64
    });
    return response.url;
}

module.exports = { upload, uploadImageToImgbb };
