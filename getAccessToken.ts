import path from 'path';
import { RefreshingAuthProvider } from '@twurple/auth';
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import open from 'open';
import { encodeScopes } from './lib';
import { google } from 'googleapis';

dotenv.config({
    path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../', '.env')],
});

const app = express();
const port = 3000;
const auth_base_url = 'https://id.twitch.tv/oauth2/authorize';
const redirect_uri = `http://localhost:${port}/auth/twitch/callback`;
const scopes = ['user:read:email', 'user:bot', 'user:write:chat', 'user:read:chat', 'chat:read', 'chat:edit'];
const adminScopes = [
    'bits:read',
    'channel:manage:broadcast',
    'channel:moderate',
    'channel:read:hype_train', 
    'channel:read:polls', 
    'channel:read:predictions', 
    'channel:read:redemptions', 
    'channel:read:subscriptions', 
    'moderator:manage:blocked_terms',
    'moderator:manage:shoutouts', 
    'moderator:manage:banned_users',
    'moderator:read:chatters',
    'moderator:read:chat_messages',
    'moderator:read:chat_settings',
    'moderator:read:followers',
    'moderator:read:moderators',
    'moderator:read:unban_requests',
    'moderator:read:warnings',
    'moderator:read:vips',
];

const clientId = process.env.TWITCH_CLIENT_ID || "";
const clientSecret = process.env.TWITCH_CLIENT_SECRET || "";

const authProvider = new RefreshingAuthProvider({
    clientId,
    clientSecret,
    redirectUri: `http://localhost`,
    appImpliedScopes: ['chat:read', 'chat:edit']
})

app.get('/auth/twitch/callback', async (req, res) => {
    const { code } = req.query;

    const userId = await authProvider.addUserForCode(code, ['chat']);

    const accessTokenWithUserId = await authProvider.getAccessTokenForUser(userId, scopes);

    if(!accessTokenWithUserId) {
        console.error('Failed to get access token')
        return res.send("Failed to get access token")
    }

    await authProvider.addUserForToken(accessTokenWithUserId, ['chat']);

    await fs.writeFile('./.wolfy_access_token', JSON.stringify(accessTokenWithUserId), 'utf-8');

    res.send("Logged in successfully");
});

//------------------------------ GOOGLE ----------------------------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URL = process.env.GOOGLE_REDIRECT_URL || `http://localhost:${port}/oauth2callback`;
const GOOGLE_SCOPE = (process.env.GOOGLE_SCOPE || "https://www.googleapis.com/auth/youtube").split(",");

const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL);

app.get('/auth/google', (req, res) => {
    const gAuthUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: GOOGLE_SCOPE
    })
    res.redirect(gAuthUrl)
})

app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query as { code?: string };
    if(!code){
        return res.status(400).send('Missing code')
    }

    try {
        const { tokens } = await oauth2.getToken(code);
        await fs.writeFile('./.google_tokens.json', JSON.stringify(tokens, null, 2), 'utf-8');
        oauth2.setCredentials(tokens);

        console.log('Google tokens saved to ./.google_tokens.json');
        console.log("Refresh token:", tokens.refresh_token ? 'present' : '(missing - see notes)');
    } catch(err: any) {
        console.error("Google auth error:", err?.message || err);
        res.status(500).send("Google auth error");
    }
})

async function run() {
    const encodedScopes = encodeScopes(scopes.concat(adminScopes));
    const authUrl = `${auth_base_url}?client_id=${clientId}&redirect_uri=${redirect_uri}&response_type=code&scope=${encodedScopes}&state`;
    await open(authUrl);
    await open(`http://localhost:${port}/auth/google`);
}

app.listen(port, () => {
    run();
    console.log(`Server is running on http://localhost:${port}`);
});