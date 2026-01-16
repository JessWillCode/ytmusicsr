import chalk from 'chalk';
import { type AccessTokenWithUserId, RefreshingAuthProvider } from '@twurple/auth';
import { ChatClient, ChatMessage, type ChatSayMessageAttributes } from '@twurple/chat';
import { Commands } from './commands';

type SenderFunction = (msg: string, opts?: ChatSayMessageAttributes) => Promise<void>;

export default async function bootstrap(
    channel: string, 
    commander: Commands
): Promise<(msg: string, opts?: ChatSayMessageAttributes, parseCommand?: boolean) => Promise<void>> {
    
    const authProvider = new RefreshingAuthProvider({
        clientId: process.env.TWITCH_CLIENT_ID || "",
        clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
        redirectUri: process.env.TWITCH_REDIRECT_URL || "http://localhost",
    });
    
    authProvider.onRefresh(([userId, token]) => {
        console.log('✓ Refreshed token for:', userId);
    });
    
    authProvider.onRefreshFailure(([userId, error]) => {
        console.error('✗ Failed to refresh token for:', userId);
        console.error(error);
    });
    
    // Load token from environment variable
    try {
        const token: AccessTokenWithUserId = JSON.parse(process.env.TWITCH_BROADCASTER_TOKEN || '{}');
        
        if (!token.accessToken || !token.userId) {
            throw new Error('Invalid TWITCH_BROADCASTER_TOKEN format');
        }
        
        await authProvider.addUserForToken(token, ['chat']);
        console.log('✓ Twitch token loaded successfully');
    } catch(err) {
        console.error("Failed to load Twitch token:", err);
        throw new Error('Please run getAccessToken.ts to generate your Twitch token');
    }

    // Create Twitch chat client
    const chatClient = new ChatClient({ 
        authProvider, 
        channels: [channel] 
    });
    
    // Connect client
    await chatClient.connect();
   
    console.log(chalk.yellow('#######################################################'));
    console.log(chalk.yellow.bold(`Connected to Twitch chat for channel: ${channel}`));
    console.log(chalk.yellow('####################################################### \n'));
    
    const send = makeSender(chatClient, channel);

    chatClient.onMessage(async (channel: string, user: string, text: string, msg: ChatMessage) => {
        console.log(chalk.greenBright('channel:'), channel, chalk.greenBright('user:'), user, chalk.greenBright('message:'), text);
        
        let [message, matched] = await commander.process(text, user, channel, send);
    
        if(matched && message) {
            await send(message);
        }
    });

    return async (msg: string, opts: ChatSayMessageAttributes = {}, parseCommand = true) => {
        if(parseCommand) {
            let [message, matched] = await commander.process(msg, channel, channel, send);
            if (matched && message) {
                await send(message);
            }
        } else {
            await send(msg);
        }
    };
}

function makeSender(client: ChatClient, channel: string): SenderFunction {
    return async (msg: string, opts?: ChatSayMessageAttributes) => {
        console.log(chalk.yellow('channel:'), channel, chalk.yellow('sending:'), msg);
        try {
            await client.say(channel, msg, opts);
        } catch(err) {
            console.error("Failed to send message:", err);
        }
    }
}