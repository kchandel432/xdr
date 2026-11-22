const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// Safety check for missing env vars
if (!CLIENT_ID) console.error('WARNING: GOOGLE_CLIENT_ID is not set');
if (!CLIENT_SECRET) console.error('WARNING: GOOGLE_CLIENT_SECRET is not set');
if (!REDIRECT_URI) console.error('WARNING: GOOGLE_REDIRECT_URI is not set');

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

app.post('/api/exchange-token', async (req, res) => {
    const { code, redirect_uri } = req.body;
    try {
        const { tokens } = await oauth2Client.getToken(code, {
            redirect_uri: redirect_uri || REDIRECT_URI,
        });
        oauth2Client.setCredentials(tokens);
        res.json({ success: true, tokens });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scan-emails', async (req, res) => {
    const { accessToken } = req.body;
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    try {
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 20,
            q: 'is:unread'
        });

        if (!response.data.messages) {
            return res.json({ success: true, messages: [] });
        }

        const messages = await Promise.all(
            response.data.messages.map(async (msg) => {
                const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
                const headers = detail.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || '';
                const from = headers.find(h => h.name === 'From')?.value || '';
                const body = detail.data.snippet || '';

                let category = 'NORMAL';
                const text = (subject + ' ' + body).toLowerCase();
                if (text.includes('kyc') && text.includes('blocked') || text.includes('cbi') || text.includes('lottery') || text.includes('prize')) {
                    category = 'FRAUD';
                } else if (text.includes('bank') || text.includes('statement') || text.includes('bill')) {
                    category = 'IMPORTANT';
                } else if (text.includes('sale') || text.includes('discount') || text.includes('offer')) {
                    category = 'SPAM';
                }

                return { id: msg.id, subject, from, body, category };
            })
        );

        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
});