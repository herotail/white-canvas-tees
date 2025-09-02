import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

// Load environment variables from .env file
dotenv.config();

const app = express();

// Configure CORS.  For this demo we allow requests from any origin. If you want
// to restrict access to specific domains in production, configure the
// `origin` option accordingly or set the ALLOWED_ORIGINS environment
// variable and reinstate the more restrictive logic used previously.
app.use(cors());


// Configure multer for file uploads; limit file size via MAX_FILE_MB
const maxBytes = parseInt(process.env.MAX_FILE_MB || '25', 10) * 1024 * 1024;
const upload = multer({
  limits: { fileSize: maxBytes },
});

// Helper to construct an authenticated Google Drive client
function getDriveClient() {
  const jsonString = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonString) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  }
  const credentials = JSON.parse(jsonString);
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/drive.file'],
  );
  return google.drive({ version: 'v3', auth });
}

// Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    // Parse metadata from request
    const metaString = req.body && req.body.meta ? req.body.meta : '{}';
    let meta;
    try {
      meta = JSON.parse(metaString);
    } catch (e) {
      meta = {};
    }
    // Obtain Drive client
    const drive = getDriveClient();
    const folderId = process.env.DRIVE_FOLDER_ID;
    if (!folderId) {
      return res.status(500).json({ error: 'DRIVE_FOLDER_ID is not set' });
    }
    // Create file in the designated folder
    const createResponse = await drive.files.create({
      requestBody: {
        name: req.file.originalname,
        parents: [folderId],
        description: JSON.stringify(meta),
      },
      media: {
        mimeType: req.file.mimetype,
        body: Readable.from(req.file.buffer),
      },
      fields: 'id, webViewLink',
    });
    const fileData = createResponse.data;
    return res.json({ fileId: fileData.id, webViewLink: fileData.webViewLink });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Start server
const PORT = process.env.PORT || 8080;
// Serve static files from the public directory (includes the front‑end)
// __dirname is computed because of ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Fallback: for any route not starting with /api, send the index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).end();
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
