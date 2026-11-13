const express = require('express');
const axios = require('axios');
const session = require('express-session');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(session({ secret: 'family-secret-key', resave: false, saveUninitialized: true }));

const DISCORD_CLIENT_ID = process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.REDIRECT_URI;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
bot.login(BOT_TOKEN);
bot.once('ready', () => console.log(`🤖 Bot logged in as ${bot.user.tag}`));

app.get('/auth/discord', (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
  res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=auth_failed');
  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code', code, redirect_uri: DISCORD_REDIRECT_URI,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token } = tokenRes.data;
    const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${access_token}` } });

    const isMember = guildsRes.data.some(g => g.id === GUILD_ID);
    if (!isMember) return res.redirect('/?error=not_member');

    req.session.user = { id: userRes.data.id, username: userRes.data.username };
    res.redirect('/form.html');
  } catch (err) {
    console.error(err);
    res.redirect('/?error=auth_failed');
  }
});

app.post('/submit-form', async (req, res) => {
  if (!req.session.user) return res.redirect('/');
  const { name, age, experience, plus } = req.body;
  const discordUser = req.session.user;
  
  try {
    const owner = await bot.users.fetch(OWNER_ID);
    await owner.send({
      content: `📥 **New Family Palermo Application!**\n\n**Discord User:** <@${discordUser.id}> (${discordUser.username})\n**Name IRL:** ${name}\n**Age IRL:** ${age}\n**RP Experience:** ${experience}\n**The Plus:** ${plus}`
    });
    res.redirect('/success.html');
  } catch (error) {
    console.error(error);
    res.send('Application received, but the bot could not send a DM. Please check your Discord privacy settings.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));