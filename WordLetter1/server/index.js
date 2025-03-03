require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));
app.use(helmet());

// Google OAuth client
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Routes
app.get('/api/auth/google/url', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/drive.file'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.json({ url });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.redirect(
      `${process.env.CLIENT_URL}?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`
    );
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Letter operations
app.post('/api/letters', async (req, res) => {
  const { content, title, accessToken } = req.body;
  
  if (!content || !title || !accessToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Setup auth with the user's access token
    const auth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    auth.setCredentials({ access_token: accessToken });

    // Create Drive client
    const drive = google.drive({ version: 'v3', auth });
    
    // Check if Letters folder exists, if not create it
    let folderId;
    const folderResponse = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='Letters' and trashed=false",
      fields: 'files(id, name)'
    });
    
    if (folderResponse.data.files.length > 0) {
      folderId = folderResponse.data.files[0].id;
    } else {
      const folderMetadata = {
        name: 'Letters',
        mimeType: 'application/vnd.google-apps.folder'
      };
      
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });
      
      folderId = folder.data.id;
    }
    
    // Save letter to Google Drive
    const docs = google.docs({ version: 'v1', auth });
    
    // First create a Google Doc
    const docResponse = await docs.documents.create({
      requestBody: {
        title: title
      }
    });
    
    const documentId = docResponse.data.documentId;
    
    // Update the content of the document
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: {
                index: 1
              },
              text: content
            }
          }
        ]
      }
    });
    
    // Move document to Letters folder
    await drive.files.update({
      fileId: documentId,
      addParents: folderId,
      fields: 'id, parents'
    });
    
    res.status(201).json({ 
      message: 'Letter saved successfully',
      documentId,
      documentUrl: `https://docs.google.com/document/d/${documentId}/edit`
    });
    
  } catch (error) {
    console.error('Error saving letter:', error);
    res.status(500).json({ error: 'Failed to save letter to Google Drive' });
  }
});

// Get list of saved letters
app.get('/api/letters', async (req, res) => {
  const { accessToken } = req.query;
  
  if (!accessToken) {
    return res.status(400).json({ error: 'Access token is required' });
  }
  
  try {
    // Setup auth with the user's access token
    const auth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    auth.setCredentials({ access_token: accessToken });
    
    // Create Drive client
    const drive = google.drive({ version: 'v3', auth });
    
    // Find Letters folder
    const folderResponse = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='Letters' and trashed=false",
      fields: 'files(id, name)'
    });
    
    if (folderResponse.data.files.length === 0) {
      return res.json({ letters: [] });
    }
    
    const folderId = folderResponse.data.files[0].id;
    
    // Get files from Letters folder
    const fileResponse = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      fields: 'files(id, name, webViewLink, createdTime)'
    });
    
    res.json({ letters: fileResponse.data.files });
    
  } catch (error) {
    console.error('Error fetching letters:', error);
    res.status(500).json({ error: 'Failed to fetch letters from Google Drive' });
  }
});

// Get a single letter for editing
app.get('/api/letters/:id', async (req, res) => {
  const { id } = req.params;
  const { accessToken } = req.query;
  
  if (!accessToken) {
    return res.status(400).json({ error: 'Access token is required' });
  }
  
  try {
    // Setup auth with the user's access token
    const auth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    auth.setCredentials({ access_token: accessToken });
    
    // Create Docs client
    const docs = google.docs({ version: 'v1', auth });
    
    // Get document content
    const document = await docs.documents.get({
      documentId: id
    });
    
    // Extract text content from the document
    let content = '';
    if (document.data.body && document.data.body.content) {
      document.data.body.content.forEach(item => {
        if (item.paragraph) {
          item.paragraph.elements.forEach(element => {
            if (element.textRun) {
              content += element.textRun.content;
            }
          });
        }
      });
    }
    
    res.json({
      id: document.data.documentId,
      title: document.data.title,
      content
    });
    
  } catch (error) {
    console.error('Error fetching letter:', error);
    res.status(500).json({ error: 'Failed to fetch letter from Google Drive' });
  }
});

// Server start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});