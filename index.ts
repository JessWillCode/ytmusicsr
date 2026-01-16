import * as dotenv from 'dotenv';
import * as path from 'path';
import TwitchBootstrap from './twitchBootstrap';
import { Commands } from './commands';
import Google from './google';

// Load environment variables
dotenv.config({
    path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../', '.env')],
});

// Validate required environment variables
const requiredEnvVars = [
    'TWITCH_CLIENT_ID',
    'TWITCH_CLIENT_SECRET',
    'TWITCH_BROADCASTER_TOKEN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        console.error('Please check your .env file and the SETUP_GUIDE.md');
        process.exit(1);
    }
}

const commander = new Commands();

// YouTube Music Configuration
const googleCfg = {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
    redirectUrl: process.env.GOOGLE_REDIRECT_URL,
    ytmCookies: process.env.YTM_COOKIES,
    requestsPlaylistName: process.env.YT_REQUESTS_PLAYLIST_NAME || 'Requests',
};

const ytPlaylistId = process.env.YT_REQUESTS_PLAYLIST_ID || '';

// Initialize Google/YouTube once
let googleSR: Google | null = null;
async function ensureGoogle() {
    if (!googleSR) {
        googleSR = new Google(googleCfg);
        await googleSR.initialize();
    }
    return googleSR;
}

// YouTube URL patterns
const YT_WATCH_RE = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/i;
const YT_SHORT_RE = /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?|$)/i;
const YT_MUSIC_RE = /(?:https?:\/\/)?music\.youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/i;

function extractYouTubeVideoId(text: string): string | null {
    return (
        text.match(YT_WATCH_RE)?.[1] ||
        text.match(YT_SHORT_RE)?.[1] ||
        text.match(YT_MUSIC_RE)?.[1] ||
        null
    );
}

// Initialize Twitch bot
async function main() {
    try {
        // No database needed!
        await TwitchBootstrap('jesswillcodee', commander);

        // Song Request Command
        commander.add('sr', async (text: string) => {
            try {
                const trimmed = (text || '').trim();
                
                if (!trimmed) {
                    return 'Please provide a song name or YouTube link!';
                }

                const google = await ensureGoogle();
                
                // If it's a YouTube/YouTube Music link → add directly by videoId
                const videoId = extractYouTubeVideoId(trimmed);
                if (videoId) {
                    const playlistId = ytPlaylistId || (await google.ensurePlaylist(googleCfg.requestsPlaylistName));
                    await google.addToPlaylist(playlistId, videoId);
                    return `✓ Added to queue: https://youtu.be/${videoId}`;
                }

                // Otherwise search on YT Music then add best match to playlist
                const best = await google.searchBestMatch(trimmed);
                if (!best) {
                    return `No results found for "${trimmed}"`;
                }
                
                const playlistId = ytPlaylistId || (await google.ensurePlaylist(googleCfg.requestsPlaylistName));
                await google.addToPlaylist(playlistId, best.videoId);
                
                return `✓ Added: ${best.title} ${best.artists.join(', ')}`;
                
            } catch (error: any) {
                console.error('Song request error:', error);
                return `Sorry, couldn't process that request. Please try again!`;
            }
        });

        // Now Playing Command (optional)
        commander.add('np', async () => {
            try {
                const google = await ensureGoogle();
                const playlistId = ytPlaylistId || (await google.ensurePlaylist(googleCfg.requestsPlaylistName));
                const nowPlaying = await google.nowPlaying(playlistId);
                
                if (!nowPlaying) {
                    return 'Nothing is playing right now!';
                }
                
                return `♪ Now Playing: ${nowPlaying.title} by ${nowPlaying.channel}`;
            } catch (error) {
                console.error('Now playing error:', error);
                return 'Could not fetch currently playing song.';
            }
        });

        // Skip Command (optional)
        commander.add('skip', async () => {
            try {
                const google = await ensureGoogle();
                const playlistId = ytPlaylistId || (await google.ensurePlaylist(googleCfg.requestsPlaylistName));
                const skipped = await google.skipFirst(playlistId);
                
                if (skipped) {
                    return '⏭ Skipped!';
                }
                return 'Queue is empty!';
            } catch (error) {
                console.error('Skip error:', error);
                return 'Could not skip song.';
            }
        });

        console.log('🎵 YouTube Music song requests ready!');
        console.log('💬 Listening for commands: !sr, !np, !skip');
        
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

main();