import YTMusic from "ytmusic-api";
import { compareTwoStrings } from "string-similarity";
import { google } from "googleapis";

const ytmusic = new YTMusic()
await ytmusic.initialize()

//searching and selecting best match
export type Picked = { title: string; artists: string[]; videoId: string; duration?: string };

export async function findBestMatch(query: string): Promise<Picked | null> {
    const results = await ytmusic.search(query);
    const songs = (results as any[]).filter(r => r.type?.toLowerCase() === "song");
    if(!songs.length){
        return null;
    }

    const ranked = songs.map((s) => ({
        s,
        score: compareTwoStrings(
            query.toLowerCase(),
            `${s.title ?? ""} ${s.artists?.map((a:any) => a.name).join(" ") ?? ""}`.toLowerCase()
        ),
    }))
    .sort((a, b) => b.score - a.score);

    const top = ranked[0].s;
    return {
        title: top.title,
        artists: (top.artists || []).map((a: any) => a.name),
        videoId: top.videoId,
        duration: top.duration
    }
}

//add to playlist
export async function addToPlaylist(videoId: string, playlistId: string){
    const oauth2 = new google.auth.OAuth2(
        
    )
}