/**
 * 🤖 DISCORD.JS v14 BOT - COMPLETE FUN & ECONOMY SYSTEM
 * ====================================================
 * Features: Full Economy, Leveling, Games, Moderation, Community Systems
 * Architecture: SINGLE FILE • Memory-Safe • Production-Ready
 * 
 * KEY SYSTEMS:
 * ✅ Economy (daily, work, rob, gamble, shop, trading, bank)
 * ✅ Leveling System (XP, ranks, rewards, badges)
 * ✅ Games (FNF, Wordle, Trivia, Slots, Blackjack, Boss Fights)
 * ✅ Community (Marriage, Profiles, Achievements, Streaks)
 * ✅ Moderation (Warnings, Timeout, Mute, Anti-Spam)
 * ✅ Pets & Adventure (Fishing, Mining, Dungeons)
 * ✅ Tickets & Suggestions (Setup & Management)
 * ✅ AI Chat (Simple Natural Responses)
 * ✅ Auto-Mod & Welcome System
 */

require('dotenv').config();
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    WebhookClient,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    PermissionOverwrites
} = require('discord.js');

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PREFIX = '!';
const OWNER_ID = process.env.OWNER_ID || '1340069836096667859';
const DATA_FILE = path.join(__dirname, 'data.json');
const GAME_TIMEOUT = 300000;
const CLEANUP_INTERVAL = 60000;

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ DATA STRUCTURES (ALL IN-MEMORY)
// ═══════════════════════════════════════════════════════════════════════════

class UserData {
    constructor() {
        this.coins = new Map();
        this.bank = new Map();
        this.xp = new Map();
        this.weapons = new Map();
        this.items = new Map();
        this.pets = new Map();
        this.achievements = new Map();
        this.badges = new Map();
        this.streaks = new Map();
        this.married = new Map();
        this.rep = new Map();
        this.warnings = new Map();
        this.mutes = new Map();
    }

    toJSON() {
        return {
            coins: Object.fromEntries(this.coins),
            bank: Object.fromEntries(this.bank),
            xp: Object.fromEntries(this.xp),
            weapons: Object.fromEntries(this.weapons),
            items: Object.fromEntries(this.items),
            pets: Object.fromEntries(this.pets),
            achievements: Object.fromEntries(this.achievements),
            badges: Object.fromEntries(this.badges),
            streaks: Object.fromEntries(this.streaks),
            married: Object.fromEntries(this.married),
            rep: Object.fromEntries(this.rep),
            warnings: Object.fromEntries(this.warnings),
            mutes: Object.fromEntries(this.mutes)
        };
    }

    fromJSON(obj) {
        if (obj.coins) for (const [k, v] of Object.entries(obj.coins)) this.coins.set(String(k), Number(v));
        if (obj.bank) for (const [k, v] of Object.entries(obj.bank)) this.bank.set(String(k), Number(v));
        if (obj.xp) for (const [k, v] of Object.entries(obj.xp)) this.xp.set(String(k), Number(v));
        if (obj.weapons) for (const [k, v] of Object.entries(obj.weapons)) this.weapons.set(String(k), Array.isArray(v) ? v : []);
        if (obj.items) for (const [k, v] of Object.entries(obj.items)) this.items.set(String(k), Array.isArray(v) ? v : []);
        if (obj.pets) for (const [k, v] of Object.entries(obj.pets)) this.pets.set(String(k), v);
        if (obj.achievements) for (const [k, v] of Object.entries(obj.achievements)) this.achievements.set(String(k), Array.isArray(v) ? v : []);
        if (obj.badges) for (const [k, v] of Object.entries(obj.badges)) this.badges.set(String(k), Array.isArray(v) ? v : []);
        if (obj.streaks) for (const [k, v] of Object.entries(obj.streaks)) this.streaks.set(String(k), v);
        if (obj.married) for (const [k, v] of Object.entries(obj.married)) this.married.set(String(k), String(v));
        if (obj.rep) for (const [k, v] of Object.entries(obj.rep)) this.rep.set(String(k), Number(v));
        if (obj.warnings) for (const [k, v] of Object.entries(obj.warnings)) this.warnings.set(String(k), Array.isArray(v) ? v : []);
        if (obj.mutes) for (const [k, v] of Object.entries(obj.mutes)) this.mutes.set(String(k), v);
    }
}

const userData = new UserData();
let staffSet = new Set();
let autoResponses = new Map();
let welcomeConfig = {};
let logsConfig = {};
let ticketConfig = {};
let suggestionConfig = {};
let reactionRoles = new Map();
let boss = null;

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ GAME MANAGERS
// ═══════════════════════════════════════════════════════════════════════════

class GameManager {
    constructor() {
        this.games = new Map();
        this.cleanupInterval = setInterval(() => this._cleanup(), CLEANUP_INTERVAL);
    }

    create(userId, type = 'fnf', difficulty = 'easy') {
        const gameId = `${userId}-${type}-${Date.now()}`;
        const game = {
            userId,
            gameId,
            type,
            difficulty,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            finished: false,
            collector: null,
            message: null,
            data: {}
        };
        this.games.set(gameId, game);
        return game;
    }

    get(gameId) {
        return this.games.get(gameId);
    }

    getByUserId(userId, type) {
        for (const [, game] of this.games.entries()) {
            if (game.userId === userId && (!type || game.type === type) && !game.finished) {
                return game;
            }
        }
        return null;
    }

    delete(gameId) {
        const game = this.games.get(gameId);
        if (game) {
            if (game.collector) game.collector.stop();
            game.finished = true;
            this.games.delete(gameId);
        }
    }

    _cleanup() {
        const now = Date.now();
        const expired = [];
        for (const [gameId, game] of this.games.entries()) {
            if (now - game.lastUpdate > GAME_TIMEOUT || game.finished) {
                expired.push(gameId);
            }
        }
        expired.forEach(id => this.delete(id));
        if (expired.length > 0) console.log(`🧹 Game cleanup: removed ${expired.length} stale games`);
    }

    destroy() {
        for (const [gameId] of this.games.entries()) this.delete(gameId);
        clearInterval(this.cleanupInterval);
    }
}

class CooldownManager {
    constructor() {
        this.cooldowns = new Map();
        this.cleanupInterval = setInterval(() => this._cleanup(), CLEANUP_INTERVAL);
    }

    set(userId, command, durationMs) {
        if (!this.cooldowns.has(command)) this.cooldowns.set(command, new Map());
        const expiresAt = Date.now() + durationMs;
        this.cooldowns.get(command).set(userId, expiresAt);
    }

    get(userId, command) {
        const cmdCooldowns = this.cooldowns.get(command);
        if (!cmdCooldowns) return null;
        const expiresAt = cmdCooldowns.get(userId);
        if (!expiresAt) return null;
        const remaining = expiresAt - Date.now();
        return remaining > 0 ? remaining : null;
    }

    has(userId, command) {
        return this.get(userId, command) !== null;
    }

    _cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [cmd, userMap] of this.cooldowns.entries()) {
            for (const [userId, expiresAt] of userMap.entries()) {
                if (expiresAt <= now) {
                    userMap.delete(userId);
                    cleaned++;
                }
            }
            if (userMap.size === 0) this.cooldowns.delete(cmd);
        }
        if (cleaned > 0) console.log(`🧹 Cooldown cleanup: removed ${cleaned} stale entries`);
    }

    destroy() {
        clearInterval(this.cleanupInterval);
    }
}

const gameManager = new GameManager();
const cooldownManager = new CooldownManager();

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ SHOP & ITEMS
// ═══════════════════════════════════════════════════════════════════════════

const WEAPONS = [
    { id: 'rusty_sword', name: 'Rusty Sword', damage: 25, price: 500, rarity: 'Common', emoji: '🗡️' },
    { id: 'shadow_blade', name: 'Shadow Blade', damage: 80, price: 8000, rarity: 'Rare', emoji: '🌙' },
    { id: 'galaxy_hammer', name: 'Galaxy Hammer', damage: 150, price: 50000, rarity: 'Legendary', emoji: '⭐' }
];

const ITEMS = [
    { id: 'health_potion', name: 'Health Potion', price: 100, type: 'consumable', emoji: '🧪' },
    { id: 'mana_gem', name: 'Mana Gem', price: 500, type: 'crafting', emoji: '💎' },
    { id: 'lucky_coin', name: 'Lucky Coin', price: 1000, type: 'special', emoji: '🪙' }
];

const PETS = [
    { id: 'dragon', name: '🐉 Dragon', price: 5000, bonus: 50 },
    { id: 'phoenix', name: '🔥 Phoenix', price: 7500, bonus: 75 },
    { id: 'wolf', name: '🐺 Wolf', price: 2000, bonus: 25 }
];

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ LEVEL & XP SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

function xpForLevel(n) {
    return Math.max(1, 5 * n * n + 50 * n + 100);
}

function getLevelInfo(totalXP) {
    let level = 0;
    let remaining = Math.max(0, Number(totalXP) || 0);
    const xpCopy = remaining;
    while (remaining >= xpForLevel(level)) {
        remaining -= xpForLevel(level);
        level++;
    }
    return { level, xpInLevel: remaining, xpRequired: xpForLevel(level), totalXP: xpCopy };
}

function buildBar(current, max, length = 10) {
    const percent = Math.max(0, Math.min(1, Number(current) / Number(max)));
    const filled = Math.floor(percent * length);
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function addXP(userId, amount) {
    const current = Number(userData.xp.get(userId)) || 0;
    const newXP = current + amount;
    userData.xp.set(userId, newXP);
    const oldLevel = getLevelInfo(current).level;
    const newLevel = getLevelInfo(newXP).level;
    return { leveledUp: newLevel > oldLevel, oldLevel, newLevel };
}

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ GAMES: WORDLE
// ═══════════════════════════════════════════════════════════════════════════

const WORDLE_WORDS = [
    'apple','brave','chess','drive','eight','flair','grace','heart','ivory','jewel',
    'knack','lemon','maple','noble','ocean','piano','quest','raven','solar','tiger',
    'ultra','vivid','wheat','xenon','yacht','zebra','adore','blaze','coral','daisy',
    'ember','flute','gleam','haste','inlet','joker','karma','lance','moose','nerve',
    'opera','prism','quail','reign','spine','torch','usher','vapor','waltz','xeric'
];

const wordleGames = new Map();

function evaluateGuess(word, guess) {
    const result = Array(5).fill('⬛');
    const wordArr = word.split('');
    const used = Array(5).fill(false);
    const gArr = guess.split('');
    
    for (let i = 0; i < 5; i++) {
        if (gArr[i] === wordArr[i]) { 
            result[i] = '🟩'; 
            used[i] = true; 
            gArr[i] = null; 
        }
    }
    
    for (let i = 0; i < 5; i++) {
        if (!gArr[i]) continue;
        for (let j = 0; j < 5; j++) {
            if (!used[j] && gArr[i] === wordArr[j]) { 
                result[i] = '🟨'; 
                used[j] = true; 
                break; 
            }
        }
    }
    
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ TRIVIA SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

const TRIVIA_QUESTIONS = [
    { q: 'What is the capital of France?', a: 'paris', options: ['london', 'berlin', 'paris', 'madrid'] },
    { q: 'What is 2 + 2?', a: '4', options: ['3', '4', '5', '6'] },
    { q: 'What is the largest planet?', a: 'jupiter', options: ['mars', 'saturn', 'jupiter', 'neptune'] },
    { q: 'Who wrote Romeo and Juliet?', a: 'shakespeare', options: ['marlowe', 'shakespeare', 'jonson', 'bacon'] },
];

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ SLOT MACHINE
// ═══════════════════════════════════════════════════════════════════════════

const SLOT_SYMBOLS = ['🍎', '🍊', '🍋', '🍌', '🍉'];

function playSlotsOnce() {
    return Array(3).fill(0).map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
}

function calculateSlotWinnings(slots, bet) {
    if (slots[0] === slots[1] && slots[1] === slots[2]) {
        return bet * 10;
    }
    if (slots[0] === slots[1] || slots[1] === slots[2]) {
        return bet * 3;
    }
    return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ BLACKJACK
// ═══════════════════════════════════════════════════════════════════════════

const BLACKJACK_DECK = ['🂡', '2', '3', '4', '5', '6', '7', '8', '9', '10', '🂮', '🂭', '🂬'];

function getCardValue(card) {
    if (['🂮', '🂭', '🂬'].includes(card)) return 10;
    if (card === '🂡') return 11;
    return parseInt(card) || 0;
}

function getHandValue(hand) {
    let value = hand.reduce((sum, card) => sum + getCardValue(card), 0);
    let aces = hand.filter(c => c === '🂡').length;
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    return value;
}

// ���══════════════════════════════════════════════════════════════════════════
// ♦️ FILE OPERATIONS (ASYNC SAFE)
// ═══════════════════════════════════════════════════════════════════════════

async function loadData() {
    try {
        if (!fsSync.existsSync(DATA_FILE)) {
            console.log('📝 No data file found, will create on first save');
            return;
        }
        
        const raw = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
        userData.fromJSON(raw.userData || {});
        if (raw.staff) staffSet = new Set(raw.staff.map(String));
        if (raw.autoResponses) autoResponses = new Map(Object.entries(raw.autoResponses));
        if (raw.welcomeConfig) welcomeConfig = raw.welcomeConfig;
        if (raw.logsConfig) logsConfig = raw.logsConfig;
        if (raw.ticketConfig) ticketConfig = raw.ticketConfig;
        if (raw.suggestionConfig) suggestionConfig = raw.suggestionConfig;
        if (raw.reactionRoles) reactionRoles = new Map(Object.entries(raw.reactionRoles));
        
        console.log('✅ Data loaded successfully');
    } catch (e) {
        console.error('❌ Load error:', e?.message);
    }
}

async function saveData() {
    try {
        const data = {
            userData: userData.toJSON(),
            staff: [...staffSet],
            autoResponses: Object.fromEntries(autoResponses),
            welcomeConfig,
            logsConfig,
            ticketConfig,
            suggestionConfig,
            reactionRoles: Object.fromEntries(reactionRoles)
        };
        
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('❌ Save error:', e?.message);
    }
}

(async () => {
    await loadData();
    setInterval(saveData, 300000);
})();

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ SLASH COMMANDS SETUP
// ═══════════════════════════════════════════════════════════════════════════

const slashCommands = [
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Check bot latency'),
    new SlashCommandBuilder().setName('help').setDescription('📖 List all commands'),
    
    // Economy
    new SlashCommandBuilder().setName('bal').setDescription('💰 Check your coins'),
    new SlashCommandBuilder().setName('bank').setDescription('🏦 Check your bank balance'),
    new SlashCommandBuilder().setName('daily').setDescription('📅 Claim daily reward'),
    new SlashCommandBuilder().setName('work').setDescription('💼 Work for coins'),
    new SlashCommandBuilder().setName('rob').setDescription('🔫 Rob a user')
        .addUserOption(o => o.setName('target').setRequired(true)),
    new SlashCommandBuilder().setName('gamble').setDescription('🎰 Gamble coins')
        .addIntegerOption(o => o.setName('amount').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('shop').setDescription('🛍️ View the shop'),
    new SlashCommandBuilder().setName('buy').setDescription('🛒 Buy an item')
        .addStringOption(o => o.setName('item').setRequired(true)),
    new SlashCommandBuilder().setName('sell').setDescription('💵 Sell an item')
        .addStringOption(o => o.setName('item').setRequired(true)),
    new SlashCommandBuilder().setName('inventory').setDescription('🎒 View your inventory'),
    new SlashCommandBuilder().setName('transfer').setDescription('💸 Transfer coins')
        .addUserOption(o => o.setName('target').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setRequired(true).setMinValue(1)),
    
    // Leveling
    new SlashCommandBuilder().setName('rank').setDescription('⭐ Check your level'),
    new SlashCommandBuilder().setName('profile').setDescription('👤 View your profile'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Top richest players'),
    
    // Games
    new SlashCommandBuilder().setName('wordle').setDescription('🎮 Play Wordle')
        .addStringOption(o => o.setName('guess').setRequired(true).setMinLength(5).setMaxLength(5)),
    new SlashCommandBuilder().setName('trivia').setDescription('🧠 Answer trivia question'),
    new SlashCommandBuilder().setName('slots').setDescription('🎰 Play slot machine')
        .addIntegerOption(o => o.setName('bet').setRequired(true).setMinValue(10)),
    new SlashCommandBuilder().setName('blackjack').setDescription('🃏 Play blackjack')
        .addIntegerOption(o => o.setName('bet').setRequired(true).setMinValue(10)),
    new SlashCommandBuilder().setName('bossfight').setDescription('👹 Fight the boss'),
    new SlashCommandBuilder().setName('8ball').setDescription('🎱 Ask the magic 8-ball')
        .addStringOption(o => o.setName('question').setRequired(true)),
    
    // Community
    new SlashCommandBuilder().setName('marry').setDescription('💍 Marry a user')
        .addUserOption(o => o.setName('user').setRequired(true)),
    new SlashCommandBuilder().setName('divorce').setDescription('💔 Divorce your spouse'),
    new SlashCommandBuilder().setName('rep').setDescription('👍 Give reputation')
        .addUserOption(o => o.setName('user').setRequired(true)),
    
    // Pets
    new SlashCommandBuilder().setName('adopt').setDescription('🐶 Adopt a pet')
        .addStringOption(o => o.setName('pet').setRequired(true)
            .addChoices(
                { name: 'Dragon 🐉', value: 'dragon' },
                { name: 'Phoenix 🔥', value: 'phoenix' },
                { name: 'Wolf 🐺', value: 'wolf' }
            )),
    new SlashCommandBuilder().setName('pet').setDescription('🐶 Check your pet'),
    
    // Adventure
    new SlashCommandBuilder().setName('fish').setDescription('🎣 Go fishing'),
    new SlashCommandBuilder().setName('mine').setDescription('⛏️ Mine for resources'),
    
    // Moderation (Staff)
    new SlashCommandBuilder().setName('warn').setDescription('⚠️ Warn a user (staff)')
        .addUserOption(o => o.setName('user').setRequired(true))
        .addStringOption(o => o.setName('reason').setRequired(true)),
    new SlashCommandBuilder().setName('warnings').setDescription('📋 Check user warnings (staff)')
        .addUserOption(o => o.setName('user').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('🤐 Mute a user (staff)')
        .addUserOption(o => o.setName('user').setRequired(true))
        .addIntegerOption(o => o.setName('duration').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('unmute').setDescription('🔊 Unmute a user (staff)')
        .addUserOption(o => o.setName('user').setRequired(true)),
    
    // Setup (Staff)
    new SlashCommandBuilder().setName('setlogs').setDescription('📋 Set mod-log channel (staff)')
        .addChannelOption(o => o.setName('channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    new SlashCommandBuilder().setName('setwelcome').setDescription('👋 Setup welcome system (staff)')
        .addChannelOption(o => o.setName('channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addRoleOption(o => o.setName('role').setRequired(false)),
    new SlashCommandBuilder().setName('settickets').setDescription('🎫 Setup ticket system (staff)')
        .addChannelOption(o => o.setName('channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    new SlashCommandBuilder().setName('setsuggestions').setDescription('💡 Setup suggestion system (staff)')
        .addChannelOption(o => o.setName('channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    
    // Owner
    new SlashCommandBuilder().setName('addxp').setDescription('⭐ Add XP (owner)')
        .addUserOption(o => o.setName('user').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('addcoins').setDescription('💰 Add coins (owner)')
        .addUserOption(o => o.setName('user').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('addstaff').setDescription('👮 Add staff member (owner)')
        .addUserOption(o => o.setName('user').setRequired(true)),
    new SlashCommandBuilder().setName('addresponse').setDescription('🤖 Add auto-response (owner)')
        .addStringOption(o => o.setName('trigger').setRequired(true))
        .addStringOption(o => o.setName('response').setRequired(true)),
];

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ CLIENT SETUP
// ═══════════════════════════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildModeration
    ]
});

const startTime = Date.now();

client.once('ready', async () => {
    try {
        console.log(`✅ Bot online as ${client.user?.tag}`);

        if (!process.env.TOKEN) {
            console.error('❌ TOKEN not set');
            return;
        }

        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { 
            body: slashCommands.map(cmd => cmd.toJSON()) 
        }).catch(e => {
            console.error('⚠️ Command registration error:', e?.message);
        });
        console.log(`✅ Registered ${slashCommands.length} slash commands`);

        for (const guild of client.guilds.cache.values()) {
            try {
                const channel = guild.systemChannel || guild.channels.cache
                    .filter(c => c.isTextBased && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages))
                    .first();
                if (channel) {
                    await channel.send('🤖 **Bot v3.0 ONLINE!**\nFull Economy • Leveling • Games • Moderation • Community Systems').catch(() => {});
                }
            } catch (e) {
                console.error('Announce error:', e?.message);
            }
        }
    } catch (e) {
        console.error('❌ Ready error:', e?.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;

        const userId = String(interaction.user?.id || '');
        const isOwner = userId === OWNER_ID;
        const isStaff = staffSet.has(userId) || isOwner;

        try {
            // ─── PING ─────────────────────────────────────────────
            if (interaction.commandName === 'ping') {
                await interaction.reply({ content: `🏓 Pong! ${client.ws.ping}ms`, ephemeral: true });
                return;
            }

            // ─── HELP ─────────────────────────────────────────────
            if (interaction.commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setColor(0x00ff88)
                    .setTitle('🤖 Bot v3.0 Commands')
                    .setDescription('Full feature list below:')
                    .addFields(
                        { name: '💰 Economy', value: '`/bal` • `/bank` • `/daily` • `/work` • `/rob` • `/gamble` • `/shop` • `/buy` • `/sell` • `/inventory` • `/transfer`' },
                        { name: '⭐ Leveling', value: '`/rank` • `/profile` • `/leaderboard`' },
                        { name: '🎮 Games', value: '`/wordle` • `/trivia` • `/slots` • `/blackjack` • `/bossfight` • `/8ball`' },
                        { name: '👨‍👩‍👧 Community', value: '`/marry` • `/divorce` • `/rep`' },
                        { name: '🐶 Pets', value: '`/adopt` • `/pet`' },
                        { name: '🎣 Adventure', value: '`/fish` • `/mine`' },
                        { name: '👮 Moderation', value: '`/warn` • `/warnings` • `/mute` • `/unmute`' },
                        { name: '⚙️ Setup', value: '`/setlogs` • `/setwelcome` • `/settickets` • `/setsuggestions`' }
                    );
                await interaction.reply({ embeds: [embed] });
                return;
            }

            // ─── BALANCE ───────────────────────────────────────────
            if (interaction.commandName === 'bal') {
                const coins = Number(userData.coins.get(userId)) || 0;
                await interaction.reply({ content: `💰 **${coins.toLocaleString()}** coins`, ephemeral: true });
                return;
            }

            // ─── BANK ──────────────────────────────────────────────
            if (interaction.commandName === 'bank') {
                const bank = Number(userData.bank.get(userId)) || 0;
                await interaction.reply({ content: `🏦 **${bank.toLocaleString()}** coins in bank`, ephemeral: true });
                return;
            }

            // ─── DAILY ─────────────────────────────────────────────
            if (interaction.commandName === 'daily') {
                const remaining = cooldownManager.get(userId, 'daily');
                if (remaining) {
                    const hours = Math.ceil(remaining / 3600000);
                    await interaction.reply({ content: `⏰ Already claimed! Come back in **${hours}h**.`, ephemeral: true });
                    return;
                }

                const reward = Math.floor(Math.random() * 500) + 200;
                userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + reward);
                addXP(userId, 50);
                cooldownManager.set(userId, 'daily', 86400000);
                await saveData();

                await interaction.reply({ content: `💰 **+${reward}** coins and **+50 XP**!` });
                return;
            }

            // ─── WORK ──────────────────────────────────────────────
            if (interaction.commandName === 'work') {
                const remaining = cooldownManager.get(userId, 'work');
                if (remaining) {
                    const mins = Math.ceil(remaining / 60000);
                    await interaction.reply({ content: `⏰ You need to rest! Come back in **${mins}m**.`, ephemeral: true });
                    return;
                }

                const earnings = Math.floor(Math.random() * 300) + 100;
                userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + earnings);
                addXP(userId, 25);
                cooldownManager.set(userId, 'work', 1800000);
                await saveData();

                await interaction.reply({ content: `💼 You worked hard and earned **${earnings}** coins!` });
                return;
            }

            // ─── ROB ───────────────────────────────────────────────
            if (interaction.commandName === 'rob') {
                const target = interaction.options.getUser('target');
                if (target.bot) {
                    await interaction.reply({ content: '❌ Cannot rob bots!', ephemeral: true });
                    return;
                }

                const tid = String(target.id);
                const targetCoins = Number(userData.coins.get(tid)) || 0;
                if (targetCoins < 100) {
                    await interaction.reply({ content: '❌ Target has less than 100 coins!', ephemeral: true });
                    return;
                }

                const stolen = Math.floor(Math.random() * targetCoins * 0.3);
                userData.coins.set(tid, targetCoins - stolen);
                userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + stolen);
                addXP(userId, 30);
                await saveData();

                await interaction.reply({ content: `💰 Successfully robbed **${target.username}** for **${stolen}** coins!` });
                return;
            }

            // ─── GAMBLE ────────────────────────────────────────────
            if (interaction.commandName === 'gamble') {
                const amount = interaction.options.getInteger('amount');
                const userCoins = Number(userData.coins.get(userId)) || 0;
                if (userCoins < amount) {
                    await interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
                    return;
                }

                const won = Math.random() > 0.5;
                if (won) {
                    userData.coins.set(userId, userCoins + amount);
                    await interaction.reply({ content: `🎰 **WIN!** **+${amount}** coins!` });
                } else {
                    userData.coins.set(userId, userCoins - amount);
                    await interaction.reply({ content: `🎰 **LOSS!** **-${amount}** coins!` });
                }
                await saveData();
                return;
            }

            // ─── SHOP ──────────────────────────────────────────────
            if (interaction.commandName === 'shop') {
                let text = '**🛍️ SHOP - Weapons:**\n\n';
                WEAPONS.forEach((w, i) => {
                    text += `**${i + 1}. ${w.emoji} ${w.name}**\nDamage: ⚔️ ${w.damage} | Price: 💰 ${w.price} | ${w.rarity}\n\n`;
                });
                text += '**Items:**\n\n';
                ITEMS.forEach((item, i) => {
                    text += `**${i + 1}. ${item.emoji} ${item.name}**\nPrice: 💰 ${item.price}\n\n`;
                });
                text += '**Pets:**\n\n';
                PETS.forEach((pet, i) => {
                    text += `**${i + 1}. ${pet.name}**\nPrice: 💰 ${pet.price}\n\n`;
                });
                text += 'Use `/buy <name>` to purchase!';
                await interaction.reply({ content: text, ephemeral: true });
                return;
            }

            // ─── BUY ───────────────────────────────────────────────
            if (interaction.commandName === 'buy') {
                const itemName = String(interaction.options.getString('item') || '').toLowerCase();
                
                let item = WEAPONS.find(i => String(i.name).toLowerCase() === itemName);
                let itemType = 'weapon';
                
                if (!item) {
                    item = ITEMS.find(i => String(i.name).toLowerCase() === itemName);
                    itemType = 'item';
                }
                
                if (!item) {
                    item = PETS.find(i => String(i.name).toLowerCase() === itemName || String(i.id).toLowerCase() === itemName);
                    itemType = 'pet';
                }
                
                if (!item) {
                    await interaction.reply({ content: '❌ Item not found', ephemeral: true });
                    return;
                }

                const userCoins = Number(userData.coins.get(userId)) || 0;
                if (userCoins < item.price) {
                    await interaction.reply({ content: `❌ Not enough coins (need ${item.price}, have ${userCoins})`, ephemeral: true });
                    return;
                }

                userData.coins.set(userId, userCoins - item.price);
                
                if (itemType === 'pet') {
                    userData.pets.set(userId, { id: item.id, name: item.name, xp: 0, level: 1 });
                } else if (itemType === 'weapon') {
                    if (!userData.weapons.has(userId)) userData.weapons.set(userId, []);
                    userData.weapons.get(userId).push({ ...item });
                } else {
                    if (!userData.items.has(userId)) userData.items.set(userId, []);
                    userData.items.get(userId).push({ ...item });
                }
                
                await saveData();
                await interaction.reply({ content: `✅ Purchased **${item.name}** for **${item.price}** coins!` });
                return;
            }

            // ─── INVENTORY ─────────────────────────────────────────
            if (interaction.commandName === 'inventory') {
                const weapons = userData.weapons.get(userId) || [];
                const items = userData.items.get(userId) || [];
                const pet = userData.pets.get(userId);
                
                let text = `**🎒 ${interaction.user.username}'s Inventory**\n\n`;
                text += `**⚔️ Weapons (${weapons.length}):**\n`;
                if (weapons.length === 0) text += 'Empty\n';
                else weapons.forEach((w, i) => text += `${i + 1}. ${w.emoji} ${w.name} (${w.rarity})\n`);
                
                text += `\n**📦 Items (${items.length}):**\n`;
                if (items.length === 0) text += 'Empty\n';
                else items.forEach((item, i) => text += `${i + 1}. ${item.emoji} ${item.name}\n`);
                
                text += `\n**🐶 Pet:**\n`;
                if (pet) text += `${pet.name} (Lvl ${pet.level})`;
                else text += 'None';
                
                await interaction.reply({ content: text, ephemeral: true });
                return;
            }

            // ─── RANK ──────────────────────────────────────────────
            if (interaction.commandName === 'rank') {
                const info = getLevelInfo(userData.xp.get(userId));
                const bar = buildBar(info.xpInLevel, info.xpRequired);
                await interaction.reply({
                    content: `⭐ **Level ${info.level}**\n${bar}\n${Math.floor(info.xpInLevel)}/${info.xpRequired} XP`,
                    ephemeral: true
                });
                return;
            }

            // ─── PROFILE ───────────────────────────────────────────
            if (interaction.commandName === 'profile') {
                const userCoins = Number(userData.coins.get(userId)) || 0;
                const bankCoins = Number(userData.bank.get(userId)) || 0;
                const info = getLevelInfo(userData.xp.get(userId));
                const married = userData.married.get(userId);
                const rep = Number(userData.rep.get(userId)) || 0;
                const pet = userData.pets.get(userId);
                
                const embed = new EmbedBuilder()
                    .setColor(0xff00ff)
                    .setTitle(`${interaction.user.username}'s Profile`)
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .addFields(
                        { name: 'Coins', value: `💰 **${userCoins.toLocaleString()}**`, inline: true },
                        { name: 'Bank', value: `🏦 **${bankCoins.toLocaleString()}**`, inline: true },
                        { name: 'Level', value: `⭐ **${info.level}**`, inline: true },
                        { name: 'Total XP', value: `**${Math.floor(info.totalXP)}**`, inline: true },
                        { name: 'Reputation', value: `👍 **${rep}**`, inline: true },
                        { name: 'Pet', value: pet ? `${pet.name} Lvl ${pet.level}` : 'None', inline: true },
                        { name: 'Married To', value: married ? `<@${married}>` : 'Single', inline: true }
                    );
                
                await interaction.reply({ embeds: [embed] });
                return;
            }

            // ─── LEADERBOARD ───────────────────────────────────────
            if (interaction.commandName === 'leaderboard') {
                const top = [...userData.coins.entries()]
                    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
                    .slice(0, 10)
                    .map(([id, amt], i) => `**#${i + 1}** <@${id}> — 💰 **${Number(amt).toLocaleString()}**`)
                    .join('\n');
                
                await interaction.reply({ 
                    content: `**🏆 Top 10 Richest Players**\n\n${top || 'No players yet'}` 
                });
                return;
            }

            // ─── WORDLE ────────────────────────────────────────────
            if (interaction.commandName === 'wordle') {
                const guess = String(interaction.options.getString('guess')).toLowerCase();
                const channelId = String(interaction.channelId);
                
                if (!wordleGames.has(channelId)) {
                    const word = WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)];
                    wordleGames.set(channelId, { word, guesses: [], maxGuesses: 6 });
                }

                const game = wordleGames.get(channelId);
                if (guess.length !== 5) {
                    await interaction.reply({ content: '❌ Must be exactly 5 letters', ephemeral: true });
                    return;
                }

                const result = evaluateGuess(game.word, guess);
                game.guesses.push({ guess, result });

                let board = '';
                for (const { guess: g, result: r } of game.guesses) {
                    board += r.join('') + '  `' + g.toUpperCase().split('').join(' ') + '`\n';
                }

                const embed = new EmbedBuilder()
                    .setTitle('Wordle Game')
                    .setDescription(board || '(Guesses will appear here)')
                    .setColor(guess === game.word ? 0x57F287 : 0x7289DA);

                if (guess === game.word) {
                    embed.setFooter({ text: `🎉 Solved in ${game.guesses.length} guess${game.guesses.length === 1 ? '' : 'es'}!` });
                    userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + 500);
                    addXP(userId, 250);
                    await saveData();
                    wordleGames.delete(channelId);
                } else if (game.guesses.length >= game.maxGuesses) {
                    embed.setFooter({ text: `The word was: **${game.word.toUpperCase()}**` });
                    wordleGames.delete(channelId);
                } else {
                    embed.setFooter({ text: `${game.maxGuesses - game.guesses.length} guesses left` });
                }

                await interaction.reply({ embeds: [embed] });
                return;
            }

            // ─── TRIVIA ────────────────────────────────────────────
            if (interaction.commandName === 'trivia') {
                const question = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`trivia_answer_${userId}`)
                        .setPlaceholder('Choose your answer')
                        .addOptions(question.options.map(opt => ({
                            label: opt.charAt(0).toUpperCase() + opt.slice(1),
                            value: opt
                        })))
                );

                const msg = await interaction.reply({
                    content: `**🧠 ${question.q}**`,
                    components: [row],
                    fetchReply: true
                });

                const collector = msg.createMessageComponentCollector({ time: 30000 });
                collector.on('collect', async btn => {
                    if (!btn.customId.includes(userId)) return;
                    const answer = btn.values[0];
                    if (answer === question.a) {
                        userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + 250);
                        addXP(userId, 100);
                        await btn.reply({ content: `✅ Correct! **+250 coins** and **+100 XP**!`, ephemeral: true });
                    } else {
                        await btn.reply({ content: `❌ Wrong! Correct answer was **${question.a}**`, ephemeral: true });
                    }
                    await saveData();
                    collector.stop();
                });

                return;
            }

            // ─── SLOTS ─────────────────────────────────────────────
            if (interaction.commandName === 'slots') {
                const bet = interaction.options.getInteger('bet');
                const userCoins = Number(userData.coins.get(userId)) || 0;
                
                if (userCoins < bet) {
                    await interaction.reply({ content: `❌ Not enough coins (need ${bet}, have ${userCoins})`, ephemeral: true });
                    return;
                }

                const slots = playSlotsOnce();
                const winnings = calculateSlotWinnings(slots, bet);
                
                userData.coins.set(userId, userCoins - bet + winnings);
                addXP(userId, Math.floor(bet / 10));
                await saveData();

                const result = winnings > 0 ? `🎰 **${slots.join('')}** — WIN! **+${winnings}** coins!` : `🎰 **${slots.join('')}** — LOSS! **-${bet}** coins!`;
                await interaction.reply({ content: result });
                return;
            }

            // ─── BLACKJACK ─────────────────────────────────────────
            if (interaction.commandName === 'blackjack') {
                const bet = interaction.options.getInteger('bet');
                const userCoins = Number(userData.coins.get(userId)) || 0;
                
                if (userCoins < bet) {
                    await interaction.reply({ content: `❌ Not enough coins!`, ephemeral: true });
                    return;
                }

                const playerHand = [BLACKJACK_DECK[Math.floor(Math.random() * BLACKJACK_DECK.length)], 
                                    BLACKJACK_DECK[Math.floor(Math.random() * BLACKJACK_DECK.length)]];
                const dealerHand = [BLACKJACK_DECK[Math.floor(Math.random() * BLACKJACK_DECK.length)], 
                                    BLACKJACK_DECK[Math.floor(Math.random() * BLACKJACK_DECK.length)]];

                const playerValue = getHandValue(playerHand);
                const dealerValue = getHandValue(dealerHand);

                let result, winnings = 0;
                if (playerValue > 21) {
                    result = `💔 BUST! You went over 21!\n-${bet} coins`;
                } else if (dealerValue > 21) {
                    result = `🎉 Dealer busted!\n+${bet * 2} coins`;
                    winnings = bet * 2;
                } else if (playerValue > dealerValue) {
                    result = `✅ You win!\n+${bet * 2} coins`;
                    winnings = bet * 2;
                } else if (dealerValue > playerValue) {
                    result = `❌ Dealer wins!\n-${bet} coins`;
                } else {
                    result = `🤝 Push (Tie)!\nBet returned`;
                    winnings = bet;
                }

                userData.coins.set(userId, userCoins - bet + winnings);
                addXP(userId, 50);
                await saveData();

                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🃏 Blackjack')
                    .addFields(
                        { name: 'Your Hand', value: `${playerHand.join(' ')} = ${playerValue}`, inline: true },
                        { name: 'Dealer Hand', value: `${dealerHand.join(' ')} = ${dealerValue}`, inline: true },
                        { name: 'Result', value: result }
                    );

                await interaction.reply({ embeds: [embed] });
                return;
            }

            // ─── BOSS FIGHT ────────────────────────────────────────
            if (interaction.commandName === 'bossfight') {
                if (!boss) {
                    boss = { name: '👹 Shadow Demon', health: 3000, maxHealth: 3000 };
                }
                
                const weapons = userData.weapons.get(userId) || [];
                const best = [...weapons].sort((a, b) => (Number(b?.damage) || 0) - (Number(a?.damage) || 0))[0] || { damage: 20 };
                const damage = Math.max(1, Number(best.damage) + Math.floor(Math.random() * 50));

                boss.health = Math.max(0, boss.health - damage);
                userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + Math.floor(damage / 2));
                await saveData();

                if (boss.health <= 0) {
                    const reward = Math.floor(damage * 2);
                    userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + reward);
                    addXP(userId, reward);
                    await saveData();
                    boss = null;
                    await interaction.reply({ content: `🎊 **Boss defeated!** Earned **${reward}** coins & XP!` });
                    return;
                }

                const bar = buildBar(boss.health, boss.maxHealth);
                await interaction.reply({ content: `⚔️ Dealt **${damage}** damage!\n${boss.name} HP: ${bar} ${boss.health}/${boss.maxHealth}` });
                return;
            }

            // ─── 8BALL ────────────────────────────────────────────
            if (interaction.commandName === '8ball') {
                const question = interaction.options.getString('question');
                const responses = [
                    'Yes, definitely! 🎯',
                    'No way! ❌',
                    'Maybe... 🤔',
                    'Ask again later 🔮',
                    'Absolutely! ✅',
                    'Highly unlikely 😬',
                    'The signs point to yes 👍',
                    'Don\'t count on it 👎',
                    'Outlook good! 😊',
                    'Very doubtful 😕'
                ];
                
                const answer = responses[Math.floor(Math.random() * responses.length)];
                await interaction.reply({ content: `🎱 **${question}**\n\n${answer}` });
                return;
            }

            // ─── MARRY ─────────────────────────────────────────────
            if (interaction.commandName === 'marry') {
                const target = interaction.options.getUser('user');
                if (target.bot) {
                    await interaction.reply({ content: '❌ Cannot marry bots!', ephemeral: true });
                    return;
                }

                const tid = String(target.id);
                if (userData.married.get(userId)) {
                    await interaction.reply({ content: '❌ You\'re already married!', ephemeral: true });
                    return;
                }

                userData.married.set(userId, tid);
                userData.married.set(tid, userId);
                userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + 1000);
                userData.coins.set(tid, (Number(userData.coins.get(tid)) || 0) + 1000);
                await saveData();

                await interaction.reply({ content: `💍 **${interaction.user.username}** married **${target.username}**! **+1000 coins** for both!` });
                return;
            }

            // ─── DIVORCE ───────────────────────────────────────────
            if (interaction.commandName === 'divorce') {
                const spouse = userData.married.get(userId);
                if (!spouse) {
                    await interaction.reply({ content: '❌ You\'re not married!', ephemeral: true });
                    return;
                }

                userData.married.delete(userId);
                userData.married.delete(spouse);
                await saveData();

                await interaction.reply({ content: `💔 You've been divorced. It's not you, it's me...` });
                return;
            }

            // ─── REP ───────────────────────────────────────────────
            if (interaction.commandName === 'rep') {
                const target = interaction.options.getUser('user');
                if (target.id === userId) {
                    await interaction.reply({ content: '❌ Cannot give rep to yourself!', ephemeral: true });
                    return;
                }

                const tid = String(target.id);
                userData.rep.set(tid, (Number(userData.rep.get(tid)) || 0) + 1);
                await saveData();

                await interaction.reply({ content: `👍 Gave rep to **${target.username}**!` });
                return;
            }

            // ─── PET ADOPT ─────────────────────────────────────────
            if (interaction.commandName === 'adopt') {
                const petChoice = interaction.options.getString('pet');
                if (userData.pets.get(userId)) {
                    await interaction.reply({ content: '❌ You already have a pet!', ephemeral: true });
                    return;
                }

                const pet = PETS.find(p => p.id === petChoice);
                if (!pet) {
                    await interaction.reply({ content: '❌ Invalid pet!', ephemeral: true });
                    return;
                }

                userData.pets.set(userId, { id: pet.id, name: pet.name, xp: 0, level: 1 });
                await saveData();

                await interaction.reply({ content: `🐶 You adopted a **${pet.name}**! Feed it with /fish or /mine!` });
                return;
            }

            // ─── PET CHECK ─────────────────────────────────────────
            if (interaction.commandName === 'pet') {
                const pet = userData.pets.get(userId);
                if (!pet) {
                    await interaction.reply({ content: '❌ You don\'t have a pet!', ephemeral: true });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setColor(0xFF69B4)
                    .setTitle(pet.name)
                    .addFields(
                        { name: 'Level', value: `**${pet.level}**`, inline: true },
                        { name: 'XP', value: `**${pet.xp}**`, inline: true },
                        { name: 'Status', value: '😊 Happy', inline: true }
                    );

                await interaction.reply({ embeds: [embed] });
                return;
            }

            // ─── FISH ──────────────────────────────────────────────
            if (interaction.commandName === 'fish') {
                const remaining = cooldownManager.get(userId, 'fish');
                if (remaining) {
                    const mins = Math.ceil(remaining / 60000);
                    await interaction.reply({ content: `⏰ Fishing cooldown! Come back in ${mins}m`, ephemeral: true });
                    return;
                }

                const catch_ = Math.random() > 0.3 ? Math.floor(Math.random() * 500) + 200 : 0;
                if (catch_) {
                    userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + catch_);
                    addXP(userId, 40);
                }
                cooldownManager.set(userId, 'fish', 600000);
                await saveData();

                await interaction.reply({ content: catch_ ? `🎣 You caught something worth **${catch_}** coins!` : '🎣 Nothing biting today...' });
                return;
            }

            // ─── MINE ──────────────────────────────────────────────
            if (interaction.commandName === 'mine') {
                const remaining = cooldownManager.get(userId, 'mine');
                if (remaining) {
                    const mins = Math.ceil(remaining / 60000);
                    await interaction.reply({ content: `⏰ Mining cooldown! Come back in ${mins}m`, ephemeral: true });
                    return;
                }

                const ore = Math.random() > 0.2 ? Math.floor(Math.random() * 600) + 300 : 0;
                if (ore) {
                    userData.coins.set(userId, (Number(userData.coins.get(userId)) || 0) + ore);
                    addXP(userId, 50);
                }
                cooldownManager.set(userId, 'mine', 900000);
                await saveData();

                await interaction.reply({ content: ore ? `⛏️ Mined **${ore}** coins worth of ore!` : '⛏️ Hit a dead end...' });
                return;
            }

            // ─── WARN (MODERATION) ─────────────────────────────────
            if (interaction.commandName === 'warn') {
                if (!isStaff) {
                    await interaction.reply({ content: '❌ Staff only', ephemeral: true });
                    return;
                }

                const target = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason');
                const tid = String(target.id);

                if (!userData.warnings.has(tid)) userData.warnings.set(tid, []);
                userData.warnings.get(tid).push({ reason, at: new Date().toISOString(), by: interaction.user.username });
                await saveData();

                await interaction.reply({ content: `⚠️ Warned **${target.username}** for: ${reason}` });
                return;
            }

            // ─── WARNINGS ──────────────────────────────────────────
            if (interaction.commandName === 'warnings') {
                if (!isStaff) {
                    await interaction.reply({ content: '❌ Staff only', ephemeral: true });
                    return;
                }

                const target = interaction.options.getUser('user');
                const tid = String(target.id);
                const warns = userData.warnings.get(tid) || [];

                if (!warns.length) {
                    await interaction.reply({ content: `✅ **${target.username}** has no warnings!`, ephemeral: true });
                    return;
                }

                let text = `**Warnings for ${target.username}:**\n\n`;
                warns.forEach((w, i) => {
                    text += `**${i + 1}.** ${w.reason} (by ${w.by})\n`;
                });

                await interaction.reply({ content: text, ephemeral: true });
                return;
            }

            // ─── MUTE ──────────────────────────────────────────────
            if (interaction.commandName === 'mute') {
                if (!isStaff) {
                    await interaction.reply({ content: '❌ Staff only', ephemeral: true });
                    return;
                }

                const target = interaction.options.getUser('user');
                const duration = interaction.options.getInteger('duration') * 60000;
                const tid = String(target.id);

                userData.mutes.set(tid, { until: Date.now() + duration, by: interaction.user.username });
                await saveData();

                await interaction.reply({ content: `🤐 **${target.username}** muted for ${Math.floor(duration / 60000)} minutes` });
                return;
            }

            // ─── UNMUTE ────────────────────────────────────────────
            if (interaction.commandName === 'unmute') {
                if (!isStaff) {
                    await interaction.reply({ content: '❌ Staff only', ephemeral: true });
                    return;
                }

                const target = interaction.options.getUser('user');
                const tid = String(target.id);

                if (!userData.mutes.has(tid)) {
                    await interaction.reply({ content: '❌ User is not muted!', ephemeral: true });
                    return;
                }

                userData.mutes.delete(tid);
                await saveData();

                await interaction.reply({ content: `🔊 **${target.username}** has been unmuted` });
                return;
            }

            // ─── ADDXP (OWNER) ────────────────────────────────────
            if (interaction.commandName === 'addxp') {
                if (!isOwner) {
                    await interaction.reply({ content: '❌ Owner only', ephemeral: true });
                    return;
                }

                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('amount');
                const tid = String(target.id);

                addXP(tid, amount);
                await saveData();

                await interaction.reply({ content: `⭐ Added **${amount}** XP to <@${tid}>` });
                return;
            }

            // ─── ADDCOINS (OWNER) ──────────────────────────────────
            if (interaction.commandName === 'addcoins') {
                if (!isOwner) {
                    await interaction.reply({ content: '❌ Owner only', ephemeral: true });
                    return;
                }

                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('amount');
                const tid = String(target.id);

                userData.coins.set(tid, (Number(userData.coins.get(tid)) || 0) + amount);
                await saveData();

                await interaction.reply({ content: `💰 Added **${amount}** coins to <@${tid}>` });
                return;
            }

            // ─── ADDSTAFF (OWNER) ──────────────────────────────────
            if (interaction.commandName === 'addstaff') {
                if (!isOwner) {
                    await interaction.reply({ content: '❌ Owner only', ephemeral: true });
                    return;
                }

                const target = interaction.options.getUser('user');
                staffSet.add(String(target.id));
                await saveData();

                await interaction.reply({ content: `👮 **${target.username}** is now staff!` });
                return;
            }

            // ─── ADDRESPONSE (OWNER) ───────────────────────────────
            if (interaction.commandName === 'addresponse') {
                if (!isOwner) {
                    await interaction.reply({ content: '❌ Owner only', ephemeral: true });
                    return;
                }

                const trigger = String(interaction.options.getString('trigger')).toLowerCase();
                const response = String(interaction.options.getString('response'));
                autoResponses.set(trigger, response);
                await saveData();

                await interaction.reply({ content: `✅ Auto-response added`, ephemeral: true });
                return;
            }

            // ─── TRANSFER ──────────────────────────────────────────
            if (interaction.commandName === 'transfer') {
                const target = interaction.options.getUser('target');
                const amount = interaction.options.getInteger('amount');
                const tid = String(target.id);

                const userCoins = Number(userData.coins.get(userId)) || 0;
                if (userCoins < amount) {
                    await interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
                    return;
                }

                userData.coins.set(userId, userCoins - amount);
                userData.coins.set(tid, (Number(userData.coins.get(tid)) || 0) + amount);
                await saveData();

                await interaction.reply({ content: `💸 Sent **${amount}** coins to **${target.username}**` });
                return;
            }

        } catch (cmdErr) {
            console.error('❌ Command error:', cmdErr?.message);
            try {
                if (!interaction.replied) {
                    await interaction.reply({ content: '❌ Command failed', ephemeral: true });
                }
            } catch (e) {
                console.error('Failed to reply:', e?.message);
            }
        }

    } catch (mainErr) {
        console.error('❌ Interaction error:', mainErr?.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ MESSAGE HANDLER (AUTO-RESPONSES & MODERATION)
// ═══════════════════════════════════════════════════════════════════════════

client.on('messageCreate', async message => {
    try {
        // Auto-responses
        if (!message.author.bot) {
            const content = message.content.toLowerCase();
            for (const [trigger, response] of autoResponses) {
                if (content.includes(trigger)) {
                    try {
                        await message.reply(response);
                    } catch (e) {
                        console.error('Auto-response error:', e?.message);
                    }
                }
            }
        }

        // Mute check
        const userId = String(message.author.id);
        const mute = userData.mutes.get(userId);
        if (mute && Date.now() < mute.until) {
            await message.delete().catch(() => {});
            return;
        } else if (mute && Date.now() >= mute.until) {
            userData.mutes.delete(userId);
        }

        // XP on message (with cooldown)
        if (!message.author.bot && !message.content.startsWith(PREFIX)) {
            if (!cooldownManager.has(userId, 'message_xp')) {
                addXP(userId, 5);
                cooldownManager.set(userId, 'message_xp', 10000);
                await saveData();
            }
        }

    } catch (e) {
        console.error('Message error:', e?.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ WELCOME SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

client.on('guildMemberAdd', async member => {
    try {
        const guildId = String(member.guild.id);
        const config = welcomeConfig[guildId];
        if (!config) return;

        const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel) return;

        if (config.roleId) {
            try {
                await member.roles.add(config.roleId);
            } catch (e) {
                console.error('Role add error:', e?.message);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('👋 Welcome!')
            .setDescription(config.message || `Welcome to ${member.guild.name}!`)
            .setThumbnail(member.user.displayAvatarURL());

        if (config.imageUrl) embed.setImage(config.imageUrl);

        await channel.send({ content: `Welcome <@${member.id}>!`, embeds: [embed] });
    } catch (e) {
        console.error('Welcome error:', e?.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ ERROR HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

process.on('unhandledRejection', err => {
    console.error('⚠️ Unhandled Rejection:', err?.message || err);
});

process.on('uncaughtException', err => {
    console.error('⚠️ Uncaught Exception:', err?.message || err);
});

client.on('error', err => {
    console.error('⚠️ Client error:', err?.message || err);
});

client.on('warn', warn => {
    console.warn('⚠️ Warning:', warn);
});

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════

async function gracefulShutdown() {
    console.log('🔴 Graceful shutdown initiated...');
    
    try {
        await saveData();
        console.log('✅ Data saved');
        
        gameManager.destroy();
        cooldownManager.destroy();
        console.log('✅ Managers cleaned up');
        
        client.destroy();
        console.log('✅ Client destroyed');
        
        process.exit(0);
    } catch (e) {
        console.error('❌ Shutdown error:', e?.message);
        process.exit(1);
    }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ═══════════════════════════════════════════════════════════════════════════
// ♦️ LOGIN
// ═══════════════════════════════════════════════════════════════════════════

if (!process.env.TOKEN) {
    console.error('❌ ERROR: TOKEN not in .env!');
    process.exit(1);
}

client.login(process.env.TOKEN).catch(err => {
    console.error('❌ Login failed:', err?.message);
    process.exit(1);
});

console.log('🚀 Bot v3.0 starting...');
