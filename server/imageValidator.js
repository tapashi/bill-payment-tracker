const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');

// Known editing software signatures in EXIF/XMP metadata
const EDITING_SOFTWARE = [
  'photoshop',
  'adobe photoshop',
  'gimp',
  'pixlr',
  'snapseed',
  'lightroom',
  'affinity photo',
  'paint.net',
  'corel',
  'canva',
  'picsart',
  'fotoflexer',
  'befunky',
  'fotor',
  'pixelmator',
  'acorn',
  'capture one',
];

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME;

/**
 * Validates an uploaded image for signs of tampering/editing.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
async function validateImage(fileBuffer, mimetype) {
  // 1. Validate it's a real image by parsing with sharp
  let metadata;
  try {
    metadata = await sharp(fileBuffer).metadata();
  } catch {
    return { valid: false, reason: 'File is not a valid image.' };
  }

  // 2. Only allow JPEG/PNG (common screenshot formats)
  const allowedFormats = ['jpeg', 'png', 'webp'];
  if (!allowedFormats.includes(metadata.format)) {
    return { valid: false, reason: `Image format "${metadata.format}" is not allowed. Use JPEG, PNG, or WebP.` };
  }

  // 3. Check EXIF metadata for editing software
  // sharp exposes exif as a raw buffer; we scan it as a string for known editors
  const bufferStr = fileBuffer.toString('latin1');

  for (const sw of EDITING_SOFTWARE) {
    // Check in EXIF, XMP, and IPTC metadata regions (all embedded in the file bytes)
    if (bufferStr.toLowerCase().includes(sw)) {
      return {
        valid: false,
        reason: `Image appears to have been edited with "${sw}". Please upload an original, unedited screenshot from your UPI app.`,
      };
    }
  }

  // 4. Check XMP metadata for edit history indicators
  const xmpIndicators = [
    'photoshop:History',
    'xmpMM:History',
    'stEvt:action',
    'stEvt:softwareAgent',
    'CreatorTool',
  ];
  for (const indicator of xmpIndicators) {
    if (bufferStr.includes(indicator)) {
      // Extract the surrounding context to check if it references editing software
      const idx = bufferStr.indexOf(indicator);
      const context = bufferStr.substring(idx, idx + 200).toLowerCase();
      for (const sw of EDITING_SOFTWARE) {
        if (context.includes(sw)) {
          return {
            valid: false,
            reason: `Image metadata contains edit history from "${sw}". Please upload an original screenshot.`,
          };
        }
      }
    }
  }

  // 5. Check for suspiciously large metadata (common in edited images)
  if (metadata.exif && metadata.exif.length > 65535) {
    return { valid: false, reason: 'Image has unusually large metadata, which may indicate editing.' };
  }

  return { valid: true };
}

/**
 * Uploads a validated image buffer to S3.
 * Returns the public URL of the uploaded file.
 */
async function uploadToS3(fileBuffer, originalName, token) {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const key = `payment-proofs/${token}/${crypto.randomUUID()}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: `image/${ext.replace('.', '') === 'jpg' ? 'jpeg' : ext.replace('.', '')}`,
    })
  );

  // Return the S3 URL
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
}

module.exports = { validateImage, uploadToS3 };
