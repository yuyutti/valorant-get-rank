require('dotenv').config();
const express = require('express');
const app = express();

const fs = require('fs');

const rankList = require('./ranklist');

const config = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI,
    ValorantAPIKey: process.env.VALORANT_API_KEY
};

app.get('/api/info/:name/:tag', async (req, res) => {
    const name = req.params.name;
    const tag = req.params.tag;
    const RiotID = {
        name: `${name}#${tag}`,
    }
    const riotUserInfo = await getRiotUserInfo(RiotID);

    return res.json(riotUserInfo);
});

app.get('/img/rank/:rank', (req, res) => { // ランクの画像を取得
    const rank = req.params.rank;
    const imgPath = rankList[rank].img;
    const img = fs.readFileSync(imgPath);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(img, 'binary');
});

// Discord認証関連の例外処理はしてない
app.get('/authorize', async (req, res) => {
    if (req.query["code"]) await responseCode(req, res); // DiscordのOAuth2認証コードを取得
    else return res.status(400).send('Bad Request');
});

async function responseCode(req, res) { // DiscordのOAuth2認証コードを取得
    try {
        const code = req.query.code;
        const tokenInfo = await fetchDiscordToken(code);
        await responseToken(tokenInfo, res);
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
}

async function responseToken(tokenInfo, res) { // DiscordのOAuth2トークンを取得
    try {
        const { token_type, access_token } = tokenInfo;
        
        const discordUserInfo = await fetchDiscordUserInfo(token_type, access_token);
        if (!discordUserInfo) {
            return res.send('Discord user info not found');
        }

        const riotGames = discordUserInfo.find((connection) => connection.type === "riotgames");
        if (!riotGames) {
            return res.send('riotGames not connected');
        }

        const riotUserInfo = await getRiotUserInfo(riotGames);

        return res.json(riotUserInfo);
    }
    catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
}

async function fetchDiscordToken(code) { // codeを使ってtokenを取得
    const params = new URLSearchParams();
    params.append("client_id", config.clientId);
    params.append("client_secret", config.clientSecret);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", config.redirectUri);

    const response = await fetch(`https://discord.com/api/oauth2/token`, {
        method: "POST",
        body: params,
    });

    return response.json();
}

async function fetchDiscordUserInfo(token_type, access_token) { // tokenを使ってDiscordのユーザー情報を取得
    const response = await fetch(`https://discord.com/api/users/@me/connections`, {
        headers: {
            "Authorization": `${token_type} ${access_token}`
        }
    });

    return response.json();
}

async function getRiotUserInfo(riotGames) { // Riotのユーザー情報を取得
    const [name, tagLine] = riotGames.name.split("#");

    const response_accountInfo = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${name}/${tagLine}`, {
        headers: {
            "Authorization": config.ValorantAPIKey
        }
    });

    const accountInfo = await response_accountInfo.json();
    const activeShard = accountInfo.data.region;

    const response_MMR = await fetch(`https://api.henrikdev.xyz/valorant/v1/mmr/${activeShard}/${name}/${tagLine}`, {
        headers: {
            "Authorization": config.ValorantAPIKey
        }
    });

    const MMR = await response_MMR.json();
    if (MMR.data.old) {
        const responseData = {
            puuid: accountInfo.data.puuid,
            gameName: accountInfo.data.name,
            tagLine: accountInfo.data.tag,
            shared: accountInfo.data.region,
            account_level: accountInfo.data.account_level
        }
        return responseData;
    }
    else {
        const responseData = {
            puuid: accountInfo.data.puuid,
            gameName: accountInfo.data.name,
            tagLine: accountInfo.data.tag,
            shared: accountInfo.data.region,
            account_level: accountInfo.data.account_level,
            currentTia: MMR.data.currenttier,
            points: MMR.data.ranking_in_tier || 0,
            currentRank: {
                ja: rankList[MMR.data.currenttier].ja,
                en: rankList[MMR.data.currenttier].en,
            },
            currentRankImg: `http://localhost:3000`+rankList[MMR.data.currenttier].url,
            mmr_change_to_last_game: MMR.data.mmr_change_to_last_game,
            totalPoints: MMR.data.elo
        }
    
        return responseData;
    }
}

// DiscordBOTログインさせてボタンインタラクトした人に自動で其の人のランク付けるみたいなこともできる

app.listen(3000, () => {
    console.log('Example app listening on port 3000!');
});