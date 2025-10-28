// Minimal GCS uploader with lazy init. Requires @google-cloud/storage if configured.
let Storage;
let storage;

function getBucket() {
  const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;
  if (!bucketName) return null;
  if (!Storage) {
    try { Storage = require('@google-cloud/storage').Storage; } catch (_) { return null; }
  }
  if (!storage) {
    try {
      storage = new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        keyFilename: process.env.NODE_ENV === 'production' 
          ? '/secrets/key.json' 
          : process.env.GOOGLE_CLOUD_KEY_FILE,
      });
    } catch (_) { return null; }
  }
  return storage.bucket(bucketName);
}

async function uploadResume(buffer, filename, mimeType, destPrefix = 'resumes') {
  const bucket = getBucket();
  if (!bucket) return null;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = Date.now();
  const dest = `${destPrefix}/${ts}_${safeName}`;
  const file = bucket.file(dest);
  // Upload without setting ACLs; UBLA forbids per-object ACLs
  await file.save(buffer, { contentType: mimeType, resumable: false, validation: false });
  // Generate a signed URL (V4) valid for 7 days
  let signedUrl;
  try {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    signedUrl = url;
  } catch (_) {
    // Fallback to non-signed URL (may not be accessible unless bucket has public IAM)
    signedUrl = `https://storage.googleapis.com/${bucket.name}/${dest}`;
  }
  return signedUrl;
}

module.exports = { uploadResume };
