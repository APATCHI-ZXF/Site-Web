const express = require('express');
const axios = require('axios');
const session = require('express-session');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const app = express();

// إعدادات أساسية
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));
app.use(session({ 
    secret: 'family-palermo-secret-key-2024', 
    resave: false, 
    saveUninitialized: true,
    cookie: { secure: false } // تم ضبطها على false لأن Render المجاني لا يدعم HTTPS بشكل مباشر في المتغيرات
}));

// جلب المتغيرات من Render
const DISCORD_CLIENT_ID = process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.REDIRECT_URI;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

// ==========================================
// مسار للتجربة والتأكد أن الخادم يعمل (Ping)
// ==========================================
app.get('/ping', (req, res) => {
    console.log('✅ تم استلام طلب على مسار /ping');
    res.send('pong! الخادم يعمل بنجاح.');
});

// ==========================================
// 1. مسار تسجيل الدخول (يوجه المستخدم إلى Discord)
// ==========================================
app.get('/auth/discord', (req, res) => {
    console.log('🔗 تم الدخول إلى مسار /auth/discord، جاري التحويل إلى ديسكورد...');
    
    // التحقق من وجود المتغيرات الأساسية لتجنب الأخطاء
    if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
        return res.status(500).send('خطأ في إعدادات الخادم: CLIENT_ID أو REDIRECT_URI غير موجود.');
    }

    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
});

// ==========================================
// 2. مسار العودة من ديسكورد (Callback)
// ==========================================
app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    console.log('🔄 تم العودة من ديسكورد، الكود:', code ? 'موجود' : 'غير موجود');

    if (!code) return res.redirect('/?error=auth_failed');

    try {
        // تبادل الكود بالتوكن
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: DISCORD_CLIENT_ID, 
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code', 
            code, 
            redirect_uri: DISCORD_REDIRECT_URI,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const { access_token } = tokenRes.data;

        // جلب بيانات المستخدم والسيرفرات
        const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
        const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${access_token}` } });

        // التحقق من أن المستخدم داخل السيرفر المطلوب
        const isMember = guildsRes.data.some(g => g.id === GUILD_ID);
        if (!isMember) {
            console.log('❌ المستخدم ليس عضواً في السيرفر');
            return res.redirect('/?error=not_member');
        }

        // حفظ بيانات المستخدم في الجلسة
        req.session.user = { id: userRes.data.id, username: userRes.data.username };
        console.log('✅ تم تسجيل الدخول بنجاح للمستخدم:', userRes.data.username);
        
        // توجيه المستخدم لصفحة الأسئلة
        res.redirect('/form.html');
    } catch (err) {
        console.error('❌ خطأ في تسجيل الدخول:', err.response ? err.response.data : err.message);
        res.redirect('/?error=auth_failed');
    }
});

// ==========================================
// 3. مسار استلام الاستمارة وإرسالها للبوت
// ==========================================
app.post('/submit-form', async (req, res) => {
    if (!req.session.user) {
        console.log('⚠️ محاولة إرسال استمارة بدون تسجيل دخول');
        return res.redirect('/'); 
    }

    const { name, age, experience, plus } = req.body;
    const discordUser = req.session.user;
    
    console.log('📝 تم استلام استمارة جديدة من:', discordUser.username);

    try {
        const owner = await bot.users.fetch(OWNER_ID);
        await owner.send({
            content: `📥 **New Family Palermo Application!**\n\n**Discord User:** <@${discordUser.id}> (${discordUser.username})\n**Name IRL:** ${name}\n**Age IRL:** ${age}\n**RP Experience:** ${experience}\n**The Plus:** ${plus}`
        });
        
        console.log('✅ تم إرسال الرسالة الخاصة للمالك بنجاح');
        res.redirect('/success.html');
    } catch (error) {
        console.error('❌ فشل إرسال الرسالة للمالك:', error.message);
        res.send('Application received, but the bot could not send a DM. Please check your Discord privacy settings (Allow DMs from server members).');
    }
});

// ==========================================
// 4. التعامل مع أي مسار غير موجود (404)
// ==========================================
app.use((req, res) => {
    console.log('🚫 مسار غير موجود (404):', req.originalUrl);
    res.status(404).send('Not Found - المسار الذي تحاول فتحه غير صحيح.');
});

// ==========================================
// تشغيل البوت والخادم
// ==========================================
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

bot.login(BOT_TOKEN).catch(err => {
    console.error('❌ فشل تسجيل دخول البوت، تأكد من صحة BOT_TOKEN:', err.message);
});

bot.once('ready', () => {
    console.log(`🤖 Bot logged in as ${bot.user.tag}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));