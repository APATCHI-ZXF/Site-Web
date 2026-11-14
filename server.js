const express = require('express');
const axios = require('axios');
const session = require('express-session');
const path = require('path');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));
app.use(session({ 
    secret: 'family-palermo-secret-key-2024', 
    resave: false, 
    saveUninitialized: true,
    cookie: { secure: false } 
}));

const DISCORD_CLIENT_ID = process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.REDIRECT_URI;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ACCEPT_ROLE_ID = '1522635551356747980';

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

app.get('/ping', (req, res) => {
    res.send('pong! الخادم يعمل بنجاح.');
});

app.get('/auth/discord', (req, res) => {
    if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
        return res.status(500).send('خطأ في إعدادات الخادم.');
    }
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=auth_failed');

    try {
        let tokenRes;
        let maxRetries = 3; // عدد المحاولات

        // حلقة تكرار: إذا كان هناك ضغط على السيرفر (429) ينتظر ويحاول مجدداً
        for (let i = 0; i < maxRetries; i++) {
            try {
                tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
                    client_id: DISCORD_CLIENT_ID, 
                    client_secret: DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code', 
                    code, 
                    redirect_uri: DISCORD_REDIRECT_URI,
                }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                break; // نجحت المحاولة، اخرج من الحلقة
            } catch (err) {
                // إذا كان الخطأ 429 (كثرة الطلبات)، انتظر 3 ثوانٍ وحاول مجدداً
                if (err.response && err.response.status === 429 && i < maxRetries - 1) {
                    console.log(`⚠️ Rate limited. Retrying in 3 seconds... (Attempt ${i+1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    throw err; // إذا كان خطأ آخر، أخرجه
                }
            }
        }

        const { access_token } = tokenRes.data;
        const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
        const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${access_token}` } });

        const isMember = guildsRes.data.some(g => g.id === GUILD_ID);
        if (!isMember) return res.redirect('/?error=not_member');

        req.session.user = { id: userRes.data.id, username: userRes.data.username };
        res.redirect('/form.html');
    } catch (err) {
        console.error('❌ خطأ في تسجيل الدخول:', err.response ? err.response.data : err.message);
        res.redirect('/?error=auth_failed');
    }
});

app.post('/submit-form', async (req, res) => {
    if (!req.session.user) return res.redirect('/');

    const { name, age, experience, plus } = req.body;
    const discordUser = req.session.user;

    try {
        const owner = await bot.users.fetch(OWNER_ID);
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_${discordUser.id}`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(`reject_${discordUser.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );

        await owner.send({
            content: `📥 **New Family Palermo Application!**\n\n**Discord User:** <@${discordUser.id}> (${discordUser.username})\n**Name IRL:** ${name}\n**Age IRL:** ${age}\n**RP Experience:** ${experience}\n**The Plus:** ${plus}`,
            components: [row] 
        });
        
        res.redirect('/success.html');
    } catch (error) {
        console.error('❌ فشل إرسال الرسالة للمالك:', error.message);
        res.send('Application received, but the bot could not send a DM.');
    }
});

bot.once('ready', () => {
    console.log(`🤖 Bot logged in as ${bot.user.tag}`);
});

bot.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ You are not allowed to use this button.', ephemeral: true });
    }

    if (interaction.customId.startsWith('accept_')) {
        const applicantId = interaction.customId.split('_')[1];
        try {
            const guild = await bot.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(applicantId);
            await member.roles.add(ACCEPT_ROLE_ID);
            await interaction.update({
                content: interaction.message.content + `\n\n✅ **ACCEPTED** by <@${OWNER_ID}>`,
                components: []
            });
        } catch (error) {
            console.error('❌ Error giving role:', error);
            interaction.reply({ content: '❌ Failed to add role. Check bot permissions.', ephemeral: true });
        }
    } 
    
    if (interaction.customId.startsWith('reject_')) {
        await interaction.update({
            content: interaction.message.content + `\n\n❌ **REJECTED** by <@${OWNER_ID}>`,
            components: []
        });
    }
});

bot.login(BOT_TOKEN).catch(err => {
    console.error('❌ فشل تسجيل دخول البوت:', err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`)); bot has "Manage Roles" permission and its role is higher than the accepted role.', ephemeral: true });
        }
    } 
    
    if (interaction.customId.startsWith('reject_')) {
        await interaction.update({
            content: interaction.message.content + `\n\n❌ **REJECTED** by <@${OWNER_ID}>`,
            components: []
        });
    }
});

// ==========================================
// 4. تشغيل الخادم والبوت (بدون أي أخطاء)
// ==========================================
bot.login(BOT_TOKEN).catch(err => {
    console.error('❌ فشل تسجيل دخول البوت، تأكد من صحة BOT_TOKEN:', err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));