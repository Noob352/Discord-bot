/**
 * 🤖 DISCORD.JS v14 BOT — COMPLETE EDITION
 * ==========================================
 * Railway-ready • All commands working • Native Discord timeout API
 *
 * SYSTEMS:
 *  ✅ Economy      — daily, work, rob, gamble, shop, buy, sell, transfer, inventory
 *  ✅ Leveling     — XP on message, rank, profile, leaderboard
 *  ✅ Games        — Wordle, Trivia, Slots, Blackjack, Boss Fight, 8-Ball
 *  ✅ Community    — marry, divorce, rep
 *  ✅ Pets         — adopt, pet
 *  ✅ Adventure    — fish, mine
 *  ✅ Moderation   — warn, warnings, mute (Discord timeout), unmute
 *  ✅ Setup        — setlogs, setwelcome, settickets, setsuggestions
 *  ✅ Owner        — addxp, addcoins, addstaff, addresponse
 *  ✅ Auto-responses, welcome system, XP on message
 *
 * RAILWAY SETUP:
 *  1. Set env vars: TOKEN, OWNER_ID
 *  2. Bot needs: Moderate Members, Send Messages, Manage Roles, Read Message History
 *  3. Enable: Message Content Intent in Discord Dev Portal
 *  4. package.json start script: "node index.js"
 *  5. Add a Railway Volume at /app for persistent data.json
 */

require('dotenv').config();

const fs      = require('fs/promises');
const fsSync  = require('fs');
const path    = require('path');

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
    ChannelType,
    StringSelectMenuBuilder,
} = require('discord.js');

// ════════════════════════════════════════════════════════════════
// ♦️ CONFIG
// ════════════════════════════════════════════════════════════════

const OWNER_ID        = process.env.OWNER_ID || '1340069836096667859';
const DATA_FILE       = path.join(__dirname, 'data.json');
const GAME_TIMEOUT    = 300_000;  // 5 min
const CLEANUP_INTERVAL = 60_000; // 1 min
const WORDLE_TIMEOUT  = 300_000;

// ════════════════════════════════════════════════════════════════
// ♦️ DATA STRUCTURES
// ════════════════════════════════════════════════════════════════

class UserData {
    constructor() {
        this.coins        = new Map();
        this.bank         = new Map();
        this.xp           = new Map();
        this.weapons      = new Map();
        this.items        = new Map();
        this.pets         = new Map();
        this.achievements = new Map();
        this.badges       = new Map();
        this.streaks      = new Map();
        this.married      = new Map();
        this.rep          = new Map();
        this.warnings     = new Map();
    }

    toJSON() {
        return {
            coins:        Object.fromEntries(this.coins),
            bank:         Object.fromEntries(this.bank),
            xp:           Object.fromEntries(this.xp),
            weapons:      Object.fromEntries(this.weapons),
            items:        Object.fromEntries(this.items),
            pets:         Object.fromEntries(this.pets),
            achievements: Object.fromEntries(this.achievements),
            badges:       Object.fromEntries(this.badges),
            streaks:      Object.fromEntries(this.streaks),
            married:      Object.fromEntries(this.married),
            rep:          Object.fromEntries(this.rep),
            warnings:     Object.fromEntries(this.warnings),
        };
    }

    fromJSON(obj) {
        const load = (map, src, parse) => {
            if (!src) return;
            for (const [k, v] of Object.entries(src)) map.set(String(k), parse(v));
        };
        load(this.coins,        obj.coins,        v => Number(v));
        load(this.bank,         obj.bank,         v => Number(v));
        load(this.xp,           obj.xp,           v => Number(v));
        load(this.weapons,      obj.weapons,      v => Array.isArray(v) ? v : []);
        load(this.items,        obj.items,        v => Array.isArray(v) ? v : []);
        load(this.pets,         obj.pets,         v => v);
        load(this.achievements, obj.achievements, v => Array.isArray(v) ? v : []);
        load(this.badges,       obj.badges,       v => Array.isArray(v) ? v : []);
        load(this.streaks,      obj.streaks,      v => v);
        load(this.married,      obj.married,      v => String(v));
        load(this.rep,          obj.rep,          v => Number(v));
        load(this.warnings,     obj.warnings,     v => Array.isArray(v) ? v : []);
    }
}

const userData       = new UserData();
let staffSet         = new Set();
let autoResponses    = new Map();
let welcomeConfig    = {};
let logsConfig       = {};
let ticketConfig     = {};
let suggestionConfig = {};
let boss             = null;

// ════════════════════════════════════════════════════════════════
// ♦️ MANAGERS
// ════════════════════════════════════════════════════════════════

class CooldownManager {
    constructor() {
        this.cooldowns = new Map();
        this._interval = setInterval(() => this._cleanup(), CLEANUP_INTERVAL);
    }

    set(userId, command, ms) {
        if (!this.cooldowns.has(command)) this.cooldowns.set(command, new Map());
        this.cooldowns.get(command).set(userId, Date.now() + ms);
    }

    get(userId, command) {
        const exp = this.cooldowns.get(command)?.get(userId);
        if (!exp) return null;
        const rem = exp - Date.now();
        return rem > 0 ? rem : null;
    }

    has(userId, command) { return this.get(userId, command) !== null; }

    _cleanup() {
        const now = Date.now();
        for (const [cmd, map] of this.cooldowns) {
            for (const [uid, exp] of map) if (exp <= now) map.delete(uid);
            if (map.size === 0) this.cooldowns.delete(cmd);
        }
    }

    destroy() { clearInterval(this._interval); }
}

const cooldownManager = new CooldownManager();

// ════════════════════════════════════════════════════════════════
// ♦️ SHOP CATALOGUE
// ════════════════════════════════════════════════════════════════

const WEAPONS = [
    { id: 'rusty_sword',   name: 'Rusty Sword',   damage: 25,  price: 500,   rarity: 'Common',    emoji: '🗡️' },
    { id: 'shadow_blade',  name: 'Shadow Blade',  damage: 80,  price: 8000,  rarity: 'Rare',      emoji: '🌙' },
    { id: 'galaxy_hammer', name: 'Galaxy Hammer', damage: 150, price: 50000, rarity: 'Legendary', emoji: '⭐' },
];

const ITEMS = [
    { id: 'health_potion', name: 'Health Potion', price: 100,  type: 'consumable', emoji: '🧪' },
    { id: 'mana_gem',      name: 'Mana Gem',      price: 500,  type: 'crafting',   emoji: '💎' },
    { id: 'lucky_coin',    name: 'Lucky Coin',    price: 1000, type: 'special',    emoji: '🪙' },
];

const PETS = [
    { id: 'dragon',  name: '🐉 Dragon',  price: 5000, bonus: 50 },
    { id: 'phoenix', name: '🔥 Phoenix', price: 7500, bonus: 75 },
    { id: 'wolf',    name: '🐺 Wolf',    price: 2000, bonus: 25 },
];

// ════════════════════════════════════════════════════════════════
// ♦️ LEVEL & XP
// ════════════════════════════════════════════════════════════════

function xpForLevel(n)      { return Math.max(1, 5 * n * n + 50 * n + 100); }
function getLevelInfo(total) {
    let level = 0, rem = Math.max(0, Number(total) || 0);
    const totalXP = rem;
    while (rem >= xpForLevel(level)) { rem -= xpForLevel(level); level++; }
    return { level, xpInLevel: rem, xpRequired: xpForLevel(level), totalXP };
}
function buildBar(cur, max, len = 10) {
    const pct = Math.max(0, Math.min(1, Number(cur) / Number(max)));
    const fill = Math.floor(pct * len);
    return '█'.repeat(fill) + '░'.repeat(len - fill);
}
function addXP(userId, amount) {
    const cur  = Number(userData.xp.get(userId)) || 0;
    const next = cur + amount;
    userData.xp.set(userId, next);
    return { leveledUp: getLevelInfo(next).level > getLevelInfo(cur).level };
}

// ════════════════════════════════════════════════════════════════
// ♦️ WORDLE
// ════════════════════════════════════════════════════════════════

const WORDLE_WORDS = [
    'apple','brave','chess','drive','eight','flair','grace','heart','ivory','jewel',
    'knack','lemon','maple','noble','ocean','piano','quest','raven','solar','tiger',
    'ultra','vivid','wheat','xenon','yacht','zebra','adore','blaze','coral','daisy',
    'ember','flute','gleam','haste','inlet','joker','karma','lance','moose','nerve',
    'opera','prism','quail','reign','spine','torch','usher','vapor','waltz','xeric',
];

const wordleGames = new Map();

function evaluateGuess(word, guess) {
    const result  = Array(5).fill('⬛');
    const wordArr = word.split('');
    const used    = Array(5).fill(false);
    const gArr    = guess.split('');

    for (let i = 0; i < 5; i++) {
        if (gArr[i] === wordArr[i]) { result[i] = '🟩'; used[i] = true; gArr[i] = null; }
    }
    for (let i = 0; i < 5; i++) {
        if (!gArr[i]) continue;
        for (let j = 0; j < 5; j++) {
            if (!used[j] && gArr[i] === wordArr[j]) { result[i] = '🟨'; used[j] = true; break; }
        }
    }
    return result;
}

// ════════════════════════════════════════════════════════════════
// ♦️ TRIVIA
// ════════════════════════════════════════════════════════════════

const TRIVIA_QUESTIONS = [
    { q: 'What is the capital of France?',      a: 'paris',       options: ['london', 'berlin', 'paris', 'madrid']    },
    { q: 'What is 2 + 2?',                      a: '4',           options: ['3', '4', '5', '6']                       },
    { q: 'What is the largest planet?',         a: 'jupiter',     options: ['mars', 'saturn', 'jupiter', 'neptune']   },
    { q: 'Who wrote Romeo and Juliet?',         a: 'shakespeare', options: ['marlowe', 'shakespeare', 'jonson', 'bacon'] },
    { q: 'How many sides does a hexagon have?', a: '6',           options: ['5', '6', '7', '8']                       },
    { q: 'What is the fastest land animal?',    a: 'cheetah',     options: ['lion', 'cheetah', 'horse', 'leopard']    },
];

// ════════════════════════════════════════════════════════════════
// ♦️ SLOTS
// ════════════════════════════════════════════════════════════════

const SLOT_SYMBOLS = ['🍎', '🍊', '🍋', '🍌', '🍉'];

function playSlotsOnce() {
    return Array(3).fill(0).map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
}
function calculateSlotWinnings(slots, bet) {
    if (slots[0] === slots[1] && slots[1] === slots[2]) return bet * 10;
    if (slots[0] === slots[1] || slots[1] === slots[2]) return bet * 3;
    return 0;
}

// ════════════════════════════════════════════════════════════════
// ♦️ BLACKJACK
// ════════════════════════════════════════════════════════════════

const BJ_DECK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function getCardValue(card) {
    if (['J', 'Q', 'K'].includes(card)) return 10;
    if (card === 'A') return 11;
    return parseInt(card) || 0;
}
function getHandValue(hand) {
    let val  = hand.reduce((s, c) => s + getCardValue(c), 0);
    let aces = hand.filter(c => c === 'A').length;
    while (val > 21 && aces > 0) { val -= 10; aces--; }
    return val;
}
function drawCard() { return BJ_DECK[Math.floor(Math.random() * BJ_DECK.length)]; }

// ════════════════════════════════════════════════════════════════
// ♦️ FRIDAY NIGHT FUNKIN — RHYTHM GAME
// ════════════════════════════════════════════════════════════════

/*
 * HOW IT WORKS:
 *  1. /fnf <difficulty> starts a game. Bot posts an embed showing
 *     a sequence of arrows the player must press as buttons.
 *  2. Each round shows ONE arrow at a time. Player has a time window
 *     to press the matching button. Arrows are shown via emoji labels
 *     on 4 buttons: ⬅️ ⬆️ ⬇️ ➡️
 *  3. Correct hit → score goes up, next arrow appears.
 *     Wrong/slow    → miss penalty applies (see difficulty).
 *  4. Game ends when all arrows in the sequence are cleared OR
 *     player runs out of health. Rewards scale with difficulty.
 *
 * DIFFICULTIES:
 *  easy      — 6 arrows  | 4.0s per arrow | 3 misses allowed | 1 miss = -1 health
 *  medium    — 10 arrows | 3.0s per arrow | 2 misses allowed | 1 miss = -2 health
 *  hard      — 14 arrows | 2.0s per arrow | 2 misses allowed | 1 miss = -3 health
 *  erect     — 18 arrows | 1.5s per arrow | 1 miss  allowed | 1 miss = -4 health
 *  nightmare — 24 arrows | 1.0s per arrow | 0 misses allowed | 1 miss = instant death + lose all points
 */

const FNF_DIFFICULTIES = {
    easy:      { arrows: 6,  timeMs: 4000, maxMisses: 3, missDmg: 1, coinMult: 1,   xpMult: 1,   label: '😊 Easy',      color: 0x57F287, maxHealth: 3 },
    medium:    { arrows: 10, timeMs: 3000, maxMisses: 2, missDmg: 2, coinMult: 2,   xpMult: 2,   label: '😐 Medium',    color: 0xFEE75C, maxHealth: 6 },
    hard:      { arrows: 14, timeMs: 2000, maxMisses: 2, missDmg: 3, coinMult: 3.5, xpMult: 3,   label: '😤 Hard',      color: 0xFFA500, maxHealth: 6 },
    erect:     { arrows: 18, timeMs: 1500, maxMisses: 1, missDmg: 4, coinMult: 6,   xpMult: 5,   label: '🔥 Erect',     color: 0xED4245, maxHealth: 4 },
    nightmare: { arrows: 24, timeMs: 1000, maxMisses: 0, missDmg: 99,coinMult: 12,  xpMult: 10,  label: '💀 Nightmare', color: 0x000000, maxHealth: 1 },
};

const FNF_ARROWS   = ['⬅️', '⬆️', '⬇️', '➡️'];
const FNF_SONGS    = ['Bopeebo', 'Fresh', 'Dadbattle', 'Tutorial', 'Spookeez', 'South', 'Pico', 'Philly', 'Blammed', 'Satin Panties', 'High', 'M.I.L.F', 'Cocoa', 'Eggnog', 'Senpai', 'Roses', 'Thorns', 'Ugh', 'Guns', 'Stress', 'Darnell', 'Lit Up', "2hot", 'Blazin'];
const FNF_RATINGS  = { perfect: '✨ PERFECT!', great: '🔥 GREAT!', good: '👍 GOOD', okay: '😐 OKAY', bad: '💀 BAD' };

const fnfGames = new Map(); // userId → game state

function buildFnfSequence(count) {
    return Array.from({ length: count }, () => FNF_ARROWS[Math.floor(Math.random() * 4)]);
}

function fnfHealthBar(health, max) {
    const filled = Math.max(0, health);
    const empty  = Math.max(0, max - filled);
    return '❤️'.repeat(filled) + '🖤'.repeat(empty);
}

function fnfRating(hits, total) {
    const pct = hits / total;
    if (pct === 1)    return FNF_RATINGS.perfect;
    if (pct >= 0.9)   return FNF_RATINGS.great;
    if (pct >= 0.75)  return FNF_RATINGS.good;
    if (pct >= 0.5)   return FNF_RATINGS.okay;
    return FNF_RATINGS.bad;
}

function buildFnfButtons(targetArrow, gameId) {
    // 4 arrow buttons — only one is "correct"
    return new ActionRowBuilder().addComponents(
        FNF_ARROWS.map(arrow =>
            new ButtonBuilder()
                .setCustomId(`fnf_${gameId}_${arrow}`)
                .setLabel(arrow)
                .setStyle(arrow === targetArrow ? ButtonStyle.Primary : ButtonStyle.Secondary)
                // All buttons look the same style to the player — no cheating!
                // Actually make them all Secondary so it's not telegraphed
                .setStyle(ButtonStyle.Secondary)
        )
    );
}

async function fnfNextArrow(interaction, game, isFollowUp = false) {
    const diff   = FNF_DIFFICULTIES[game.difficulty];
    const target = game.sequence[game.currentIndex];
    const gameId = game.gameId;

    const progressBar = `${game.currentIndex + 1}/${game.sequence.length}`;
    const healthBar   = fnfHealthBar(game.health, diff.maxHealth);

    const embed = new EmbedBuilder()
        .setColor(diff.color)
        .setTitle(`🎵 Friday Night Funkin' — ${diff.label}`)
        .setDescription(
            `**Song:** ${game.song}\n\n` +
            `**Hit this arrow!**\n` +
            `# ${target}\n\n` +
            `⏱️ You have **${diff.timeMs / 1000}s** to react!\n` +
            `❤️ Health: ${healthBar}`
        )
        .addFields(
            { name: '🎯 Progress', value: progressBar,         inline: true },
            { name: '✅ Hits',     value: String(game.hits),    inline: true },
            { name: '❌ Misses',   value: String(game.misses),  inline: true },
        )
        .setFooter({ text: `Score: ${game.score} pts` });

    const row = new ActionRowBuilder().addComponents(
        FNF_ARROWS.map(arrow =>
            new ButtonBuilder()
                .setCustomId(`fnf_${gameId}_${arrow}`)
                .setLabel(arrow)
                .setStyle(ButtonStyle.Secondary)
        )
    );

    let msg;
    if (isFollowUp) {
        msg = await interaction.followUp({ embeds: [embed], components: [row] });
    } else {
        msg = await interaction.editReply({ embeds: [embed], components: [row] });
    }
    game.currentMessage = msg;

    // Per-arrow timeout
    game.arrowTimeout = setTimeout(async () => {
        // Player didn't press in time — counts as a miss
        await fnfHandleMiss(interaction, game, 'timeout');
    }, diff.timeMs);
}

async function fnfHandleMiss(interaction, game, reason) {
    clearTimeout(game.arrowTimeout);
    const diff = FNF_DIFFICULTIES[game.difficulty];
    game.misses++;

    if (game.difficulty === 'nightmare') {
        // NIGHTMARE: one miss = instant death, lose all points
        game.score  = 0;
        game.health = 0;
        await fnfEndGame(interaction, game, false, '💀 ONE MISS AND IT\'S OVER. This is Nightmare.');
        return;
    }

    game.health = Math.max(0, game.health - diff.missDmg);

    if (game.health <= 0 || game.misses > diff.maxMisses) {
        await fnfEndGame(interaction, game, false, reason === 'timeout' ? '⏰ Too slow!' : '❌ Wrong arrow!');
        return;
    }

    // Show miss feedback then move on
    const missEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Miss!')
        .setDescription(reason === 'timeout' ? '⏰ Too slow! Move faster!' : '❌ Wrong arrow! Stay focused!')
        .addFields({ name: '❤️ Health', value: fnfHealthBar(game.health, diff.maxHealth) });

    try {
        await interaction.editReply({ embeds: [missEmbed], components: [] });
    } catch (_) {}

    await new Promise(r => setTimeout(r, 800));
    game.currentIndex++;

    if (game.currentIndex >= game.sequence.length) {
        await fnfEndGame(interaction, game, true);
    } else {
        await fnfNextArrow(interaction, game);
    }
}

async function fnfEndGame(interaction, game, won, reason = '') {
    clearTimeout(game.arrowTimeout);
    fnfGames.delete(game.userId);

    const diff    = FNF_DIFFICULTIES[game.difficulty];
    const rating  = won ? fnfRating(game.hits, game.sequence.length) : '💀 FAILED';
    const coins_r = won ? Math.floor(game.score * diff.coinMult) : Math.floor(game.score * 0.1);
    const xp_r    = won ? Math.floor(game.hits * 10 * diff.xpMult) : 0;

    if (coins_r > 0) addCoins(game.userId, coins_r);
    if (xp_r    > 0) addXP(game.userId, xp_r);
    await saveData();

    const embed = new EmbedBuilder()
        .setColor(won ? diff.color : 0x36393f)
        .setTitle(won ? `🎵 Song Clear! ${rating}` : `💀 Game Over — ${diff.label}`)
        .setDescription(
            won
                ? `You cleared **${game.song}** on **${diff.label}**!\n\n${reason}`
                : `You failed **${game.song}** on **${diff.label}**.\n\n${reason}`
        )
        .addFields(
            { name: '🎯 Hits',    value: `${game.hits}/${game.sequence.length}`,  inline: true },
            { name: '❌ Misses',  value: String(game.misses),                      inline: true },
            { name: '🏆 Score',   value: String(game.score),                       inline: true },
            { name: '💰 Coins',   value: `+${coins_r}`,                            inline: true },
            { name: '⭐ XP',      value: `+${xp_r}`,                              inline: true },
            { name: '🎤 Rating',  value: rating,                                   inline: true },
        )
        .setFooter({ text: won ? 'GG! Play again?' : 'Better luck next time!' });

    try {
        await interaction.editReply({ embeds: [embed], components: [] });
    } catch (_) {
        await interaction.followUp({ embeds: [embed], components: [] }).catch(() => {});
    }
}

// ════════════════════════════════════════════════════════════════
// ♦️ FILE I/O
// ════════════════════════════════════════════════════════════════

async function loadData() {
    try {
        if (!fsSync.existsSync(DATA_FILE)) { console.log('📝 No data file, starting fresh'); return; }
        const raw = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
        userData.fromJSON(raw.userData || {});
        if (raw.staff)          staffSet         = new Set(raw.staff.map(String));
        if (raw.autoResponses)  autoResponses    = new Map(Object.entries(raw.autoResponses));
        if (raw.welcomeConfig)  welcomeConfig    = raw.welcomeConfig;
        if (raw.logsConfig)     logsConfig       = raw.logsConfig;
        if (raw.ticketConfig)   ticketConfig     = raw.ticketConfig;
        if (raw.suggestionConfig) suggestionConfig = raw.suggestionConfig;
        console.log('✅ Data loaded');
    } catch (e) { console.error('❌ Load error:', e?.message); }
}

async function saveData() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify({
            userData:         userData.toJSON(),
            staff:            [...staffSet],
            autoResponses:    Object.fromEntries(autoResponses),
            welcomeConfig,
            logsConfig,
            ticketConfig,
            suggestionConfig,
        }, null, 2), 'utf8');
    } catch (e) { console.error('❌ Save error:', e?.message); }
}

// ════════════════════════════════════════════════════════════════
// ♦️ SLASH COMMANDS
// ════════════════════════════════════════════════════════════════

const slashCommands = [
    // Utility
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Check bot latency'),
    new SlashCommandBuilder().setName('help').setDescription('📖 List all commands'),

    // Economy
    new SlashCommandBuilder().setName('bal').setDescription('💰 Check your coins'),
    new SlashCommandBuilder().setName('bank').setDescription('🏦 Check your bank balance'),
    new SlashCommandBuilder().setName('daily').setDescription('📅 Claim daily reward'),
    new SlashCommandBuilder().setName('work').setDescription('💼 Work for coins'),
    new SlashCommandBuilder().setName('rob').setDescription('🔫 Rob a user')
        .addUserOption(o => o.setName('target').setDescription('Who to rob').setRequired(true)),
    new SlashCommandBuilder().setName('gamble').setDescription('🎰 Gamble coins')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to gamble').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('shop').setDescription('🛍️ View the shop'),
    new SlashCommandBuilder().setName('buy').setDescription('🛒 Buy an item')
        .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),
    new SlashCommandBuilder().setName('sell').setDescription('💵 Sell an item from inventory')
        .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),
    new SlashCommandBuilder().setName('inventory').setDescription('🎒 View your inventory'),
    new SlashCommandBuilder().setName('transfer').setDescription('💸 Transfer coins to someone')
        .addUserOption(o => o.setName('target').setDescription('Who to send coins to').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),

    // Leveling
    new SlashCommandBuilder().setName('rank').setDescription('⭐ Check your level'),
    new SlashCommandBuilder().setName('profile').setDescription('👤 View your profile'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Top richest players'),

    // Games
    new SlashCommandBuilder().setName('wordle').setDescription('🎮 Play Wordle')
        .addStringOption(o => o.setName('guess').setDescription('Your 5-letter guess').setRequired(true).setMinLength(5).setMaxLength(5)),
    new SlashCommandBuilder().setName('trivia').setDescription('🧠 Answer a trivia question'),
    new SlashCommandBuilder().setName('slots').setDescription('🎰 Play the slot machine')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(10)),
    new SlashCommandBuilder().setName('blackjack').setDescription('🃏 Play blackjack')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(10)),
    new SlashCommandBuilder().setName('bossfight').setDescription('👹 Attack the boss'),
    new SlashCommandBuilder().setName('8ball').setDescription('🎱 Ask the magic 8-ball')
        .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
    new SlashCommandBuilder().setName('fnf').setDescription('🎵 Play Friday Night Funkin\'!')
        .addStringOption(o => o.setName('difficulty').setDescription('Pick your difficulty').setRequired(true)
            .addChoices(
                { name: '😊 Easy      — 6 arrows  | 4s each | 3 misses', value: 'easy'      },
                { name: '😐 Medium    — 10 arrows | 3s each | 2 misses', value: 'medium'    },
                { name: '😤 Hard      — 14 arrows | 2s each | 2 misses', value: 'hard'      },
                { name: '🔥 Erect     — 18 arrows | 1.5s    | 1 miss',   value: 'erect'     },
                { name: '💀 Nightmare — 24 arrows | 1s each | 0 misses', value: 'nightmare' },
            )),

    // Community
    new SlashCommandBuilder().setName('marry').setDescription('💍 Propose to a user')
        .addUserOption(o => o.setName('user').setDescription('Who to marry').setRequired(true)),
    new SlashCommandBuilder().setName('divorce').setDescription('💔 Divorce your spouse'),
    new SlashCommandBuilder().setName('rep').setDescription('👍 Give someone reputation')
        .addUserOption(o => o.setName('user').setDescription('Who to rep').setRequired(true)),

    // Pets
    new SlashCommandBuilder().setName('adopt').setDescription('🐶 Adopt a pet')
        .addStringOption(o => o.setName('pet').setDescription('Pick a pet').setRequired(true)
            .addChoices(
                { name: 'Dragon 🐉', value: 'dragon'  },
                { name: 'Phoenix 🔥', value: 'phoenix' },
                { name: 'Wolf 🐺',   value: 'wolf'    },
            )),
    new SlashCommandBuilder().setName('pet').setDescription('🐶 Check on your pet'),

    // Adventure
    new SlashCommandBuilder().setName('fish').setDescription('🎣 Go fishing'),
    new SlashCommandBuilder().setName('mine').setDescription('⛏️ Mine for resources'),

    // Moderation (staff)
    new SlashCommandBuilder().setName('warn').setDescription('⚠️ Warn a user (staff)')
        .addUserOption(o => o.setName('user').setDescription('Who to warn').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
    new SlashCommandBuilder().setName('warnings').setDescription('📋 Check a user\'s warnings (staff)')
        .addUserOption(o => o.setName('user').setDescription('Who to check').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('🤐 Timeout a user (staff)')
        .addUserOption(o => o.setName('user').setDescription('Who to mute').setRequired(true))
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320)),
    new SlashCommandBuilder().setName('unmute').setDescription('🔊 Remove timeout from a user (staff)')
        .addUserOption(o => o.setName('user').setDescription('Who to unmute').setRequired(true)),

    // Setup (staff)
    new SlashCommandBuilder().setName('setlogs').setDescription('📋 Set mod-log channel (staff)')
        .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    new SlashCommandBuilder().setName('setwelcome').setDescription('👋 Setup welcome system (staff)')
        .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addRoleOption(o => o.setName('role').setDescription('Auto-role for new members').setRequired(false)),
    new SlashCommandBuilder().setName('settickets').setDescription('🎫 Setup ticket system (staff)')
        .addChannelOption(o => o.setName('channel').setDescription('Channel for ticket panel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    new SlashCommandBuilder().setName('setsuggestions').setDescription('💡 Setup suggestion channel (staff)')
        .addChannelOption(o => o.setName('channel').setDescription('Suggestion channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),

                                                         

    // Owner
    new SlashCommandBuilder().setName('addxp').setDescription('⭐ Add XP to a user (owner)')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('XP amount').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('addcoins').setDescription('💰 Add coins to a user (owner)')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Coin amount').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('addstaff').setDescription('👮 Promote a user to staff (owner)')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),
    new SlashCommandBuilder().setName('addresponse').setDescription('🤖 Add an auto-response (owner)')
        .addStringOption(o => o.setName('trigger').setDescription('Trigger word/phrase').setRequired(true))
        .addStringOption(o => o.setName('response').setDescription('Response text').setRequired(true)),
];

// ════════════════════════════════════════════════════════════════
// ♦️ CLIENT
// ════════════════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
    ],
});

// ════════════════════════════════════════════════════════════════
// ♦️ READY
// ════════════════════════════════════════════════════════════════

client.once('ready', async () => {
    try {
        console.log(`✅ Bot online as ${client.user?.tag}`);
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), {
            body: slashCommands.map(c => c.toJSON()),
        }).catch(e => console.error('⚠️ Command registration error:', e?.message));
        console.log(`✅ Registered ${slashCommands.length} slash commands`);
    } catch (e) {
        console.error('❌ Ready error:', e?.message);
    }
});

// ════════════════════════════════════════════════════════════════
// ♦️ HELPERS
// ════════════════════════════════════════════════════════════════

function coins(userId)  { return Number(userData.coins.get(userId))  || 0; }
function bank(userId)   { return Number(userData.bank.get(userId))   || 0; }

function addCoins(userId, amount) {
    userData.coins.set(userId, Math.max(0, coins(userId) + amount));
}

async function staffOnly(interaction, isStaff) {
    if (!isStaff) {
        await interaction.reply({ content: '❌ Staff only!', ephemeral: true });
        return false;
    }
    return true;
}

async function ownerOnly(interaction, isOwner) {
    if (!isOwner) {
        await interaction.reply({ content: '❌ Owner only!', ephemeral: true });
        return false;
    }
    return true;
}

// ════════════════════════════════════════════════════════════════
// ♦️ INTERACTION HANDLER
// ════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;

        const userId  = String(interaction.user.id);
        const isOwner = userId === OWNER_ID;
        const isStaff = staffSet.has(userId) || isOwner;

        try {

            // ─── PING ─────────────────────────────────────────────
            if (interaction.commandName === 'ping') {
                await interaction.reply({ content: `🏓 Pong! **${client.ws.ping}ms**`, ephemeral: true });
                return;
            }

    

            // ─── HELP ─────────────────────────────────────────────
            if (interaction.commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setColor(0x00ff88)
                    .setTitle('🤖 Bot Commands')
                    .addFields(
                        { name: '💰 Economy',    value: '`/bal` `/bank` `/daily` `/work` `/rob` `/gamble` `/shop` `/buy` `/sell` `/inventory` `/transfer`' },
                        { name: '⭐ Leveling',   value: '`/rank` `/profile` `/leaderboard`' },
                        { name: '🎮 Games',      value: '`/wordle` `/trivia` `/slots` `/blackjack` `/bossfight` `/8ball` `/fnf`' },
                        { name: '👨‍👩‍👧 Community', value: '`/marry` `/divorce` `/rep`' },
                        { name: '🐶 Pets',       value: '`/adopt` `/pet`' },
                        { name: '🎣 Adventure',  value: '`/fish` `/mine`' },
                        { name: '👮 Moderation', value: '`/warn` `/warnings` `/mute` `/unmute`' },
                        { name: '⚙️ Setup',      value: '`/setlogs` `/setwelcome` `/settickets` `/setsuggestions`' },
                    );
                await interaction.reply({ embeds: [embed] });
                return;
            }

            // ─── BALANCE ───────────────────────────────────────────
            if (interaction.commandName === 'bal') {
                await interaction.reply({ content: `💰 **${coins(userId).toLocaleString()}** coins in wallet`, ephemeral: true });
                return;
            }

            // ─── BANK ──────────────────────────────────────────────
            if (interaction.commandName === 'bank') {
                await interaction.reply({ content: `🏦 **${bank(userId).toLocaleString()}** coins in bank`, ephemeral: true });
                return;
            }

            // ─── DAILY ─────────────────────────────────────────────
            if (interaction.commandName === 'daily') {
                const rem = cooldownManager.get(userId, 'daily');
                if (rem) {
                    const h = Math.ceil(rem / 3_600_000);
                    await interaction.reply({ content: `⏰ Already claimed! Come back in **${h}h**`, ephemeral: true });
                    return;
                }
                const reward = Math.floor(Math.random() * 500) + 200;
                addCoins(userId, reward);
                addXP(userId, 50);
                cooldownManager.set(userId, 'daily', 86_400_000);
                await saveData();
                await interaction.reply({ content: `💰 Claimed your daily! **+${reward} coins** and **+50 XP**! 🎉` });
                return;
            }

            // ─── WORK ──────────────────────────────────────────────
            if (interaction.commandName === 'work') {
                const rem = cooldownManager.get(userId, 'work');
                if (rem) {
                    const m = Math.ceil(rem / 60_000);
                    await interaction.reply({ content: `⏰ You need rest! Come back in **${m}m**`, ephemeral: true });
                    return;
                }
                const jobs    = ['mowed lawns', 'delivered pizza', 'coded an app', 'walked dogs', 'washed cars'];
                const job     = jobs[Math.floor(Math.random() * jobs.length)];
                const earned  = Math.floor(Math.random() * 300) + 100;
                addCoins(userId, earned);
                addXP(userId, 25);
                cooldownManager.set(userId, 'work', 1_800_000);
                await saveData();
                await interaction.reply({ content: `💼 You ${job} and earned **${earned} coins**!` });
                return;
            }

            // ─── ROB ───────────────────────────────────────────────
            if (interaction.commandName === 'rob') {
                const target = interaction.options.getUser('target');
                if (!target || target.bot) {
                    await interaction.reply({ content: '❌ Invalid target!', ephemeral: true });
                    return;
                }
                const tid         = String(target.id);
                const targetCoins = coins(tid);
                if (targetCoins < 100) {
                    await interaction.reply({ content: '❌ Target has less than 100 coins — not worth it!', ephemeral: true });
                    return;
                }
                const success = Math.random() > 0.4;
                if (success) {
                    const stolen = Math.floor(Math.random() * targetCoins * 0.3) + 1;
                    addCoins(tid, -stolen);
                    addCoins(userId, stolen);
                    addXP(userId, 30);
                    await saveData();
                    await interaction.reply({ content: `🔫 You robbed **${target.username}** for **${stolen} coins**! 💰` });
                } else {
                    const fine = Math.floor(coins(userId) * 0.1) || 50;
                    addCoins(userId, -fine);
                    await saveData();
                    await interaction.reply({ content: `🚔 You got caught robbing **${target.username}** and fined **${fine} coins**!` });
                }
                return;
            }

            // ─── GAMBLE ────────────────────────────────────────────
            if (interaction.commandName === 'gamble') {
                const amount = interaction.options.getInteger('amount');
                if (coins(userId) < amount) {
                    await interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
                    return;
                }
                const won = Math.random() > 0.5;
                addCoins(userId, won ? amount : -amount);
                await saveData();
                await interaction.reply({ content: won
                    ? `🎰 **WIN!** +${amount} coins! 🎉`
                    : `🎰 **LOSS!** -${amount} coins 😔` });
                return;
            }

            // ─── SHOP ──────────────────────────────────────────────
            if (interaction.commandName === 'shop') {
                let text = '**🛍️ SHOP**\n\n**⚔️ Weapons:**\n';
                WEAPONS.forEach(w => { text += `${w.emoji} **${w.name}** — ⚔️ ${w.damage} dmg | 💰 ${w.price} | ${w.rarity}\n`; });
                text += '\n**📦 Items:**\n';
                ITEMS.forEach(i  => { text += `${i.emoji} **${i.name}** — 💰 ${i.price}\n`; });
                text += '\n**🐾 Pets:**\n';
                PETS.forEach(p  => { text += `${p.name} — 💰 ${p.price}\n`; });
                text += '\n> Use `/buy <name>` to purchase!';
                await interaction.reply({ content: text, ephemeral: true });
                return;
            }

            // ─── BUY ───────────────────────────────────────────────
            if (interaction.commandName === 'buy') {
                const query = String(interaction.options.getString('item')).toLowerCase();

                let item = WEAPONS.find(i => i.name.toLowerCase() === query || i.id === query);
                let type = 'weapon';
                if (!item) { item = ITEMS.find(i => i.name.toLowerCase() === query || i.id === query); type = 'item'; }
                if (!item) { item = PETS.find(i  => i.name.toLowerCase().includes(query) || i.id === query); type = 'pet'; }

                if (!item) {
                    await interaction.reply({ content: '❌ Item not found. Check `/shop` for item names.', ephemeral: true });
                    return;
                }
                if (coins(userId) < item.price) {
                    await interaction.reply({ content: `❌ Not enough coins (need **${item.price}**, you have **${coins(userId)}**)`, ephemeral: true });
                    return;
                }

                addCoins(userId, -item.price);
                if (type === 'pet') {
                    userData.pets.set(userId, { id: item.id, name: item.name, xp: 0, level: 1 });
                } else if (type === 'weapon') {
                    if (!userData.weapons.has(userId)) userData.weapons.set(userId, []);
                    userData.weapons.get(userId).push({ ...item });
                } else {
                    if (!userData.items.has(userId)) userData.items.set(userId, []);
                    userData.items.get(userId).push({ ...item });
                }

                await saveData();
                await interaction.reply({ content: `✅ Purchased **${item.name}** for **${item.price} coins**!` });
                return;
            }

            // ─── SELL ──────────────────────────────────────────────
            if (interaction.commandName === 'sell') {
                const query   = String(interaction.options.getString('item')).toLowerCase();
                const weapons = userData.weapons.get(userId) || [];
                const items   = userData.items.get(userId)   || [];

                const wIdx = weapons.findIndex(w => w.name.toLowerCase() === query || w.id === query);
                if (wIdx !== -1) {
                    const w      = weapons[wIdx];
                    const refund = Math.floor(w.price * 0.5);
                    weapons.splice(wIdx, 1);
                    userData.weapons.set(userId, weapons);
                    addCoins(userId, refund);
                    await saveData();
                    await interaction.reply({ content: `💵 Sold **${w.emoji} ${w.name}** for **${refund} coins** (50% refund)` });
                    return;
                }

                const iIdx = items.findIndex(i => i.name.toLowerCase() === query || i.id === query);
                if (iIdx !== -1) {
                    const it     = items[iIdx];
                    const refund = Math.floor(it.price * 0.5);
                    items.splice(iIdx, 1);
                    userData.items.set(userId, items);
                    addCoins(userId, refund);
                    await saveData();
                    await interaction.reply({ content: `💵 Sold **${it.emoji} ${it.name}** for **${refund} coins** (50% refund)` });
                    return;
                }

                await interaction.reply({ content: '❌ Item not in your inventory. Check `/inventory`.', ephemeral: true });
                return;
            }


    // ─── INVENTORY ─────────────────────────────────────────
            if (interaction.commandName === 'inventory') {
                const weapons = userData.weapons.get(userId) || [];
                const items   = userData.items.get(userId)   || [];
                const pet     = userData.pets.get(userId);

                let text = `**🎒 ${interaction.user.username}'s Inventory**\n\n`;
                text += `**⚔️ Weapons (${weapons.length}):**\n`;
                text += weapons.length ? weapons.map((w, i) => `${i + 1}. ${w.emoji} ${w.name} (${w.rarity})`).join('\n') : 'Empty';
                text += `\n\n**📦 Items (${items.length}):**\n`;
                text += items.length ? items.map((it, i) => `${i + 1}. ${it.emoji} ${it.name}`).join('\n') : 'Empty';
                text += `\n\n**🐾 Pet:**\n`;
                text += pet ? `${pet.name} (Lvl ${pet.level}, ${pet.xp} XP)` : 'None';

                await interaction.reply({ content: text, ephemeral: true });
                return;
            }

            // ─── TRANSFER ──────────────────────────────────────────
            if (interaction.commandName === 'transfer') {
                const target = interaction.options.getUser('target');
                const amount = interaction.options.getInteger('amount');
                if (!target || target.bot || target.id === userId) {
                    await interaction.reply({ content: '❌ Invalid target!', ephemeral: true });
                    return;
                }
                if (coins(userId) < amount) {
                    await interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
                    return;
                }
                addCoins(userId, -amount);
                addCoins(String(target.id), amount);
                await saveData();
                await interaction.reply({ content: `💸 Sent **${amount} coins** to **${target.username}**!` });
                return;
            }

            // ─── RANK ──────────────────────────────────────────────
            if (interaction.commandName === 'rank') {
                const info = getLevelInfo(userData.xp.get(userId));
                const bar  = buildBar(info.xpInLevel, info.xpRequired);
                await interaction.reply({
                    content: `⭐ **Level ${info.level}**\n\`${bar}\` ${Math.floor(info.xpInLevel)}/${info.xpRequired} XP`,
                    ephemeral: true,
                });
                return;
            }

            // ─── PROFILE ───────────────────────────────────────────
            if (interaction.commandName === 'profile') {
                const info    = getLevelInfo(userData.xp.get(userId));
                const married = userData.married.get(userId);
                const rep     = Number(userData.rep.get(userId)) || 0;
                const pet     = userData.pets.get(userId);

                const embed = new EmbedBuilder()
                    .setColor(0xff00ff)
                    .setTitle(`${interaction.user.username}'s Profile`)
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .addFields(
                        { name: '💰 Coins',      value: coins(userId).toLocaleString(), inline: true },
                        { name: '🏦 Bank',       value: bank(userId).toLocaleString(),  inline: true },
                        { name: '⭐ Level',      value: String(info.level),             inline: true },
                        { name: '📊 Total XP',   value: String(Math.floor(info.totalXP)), inline: true },
                        { name: '👍 Rep',        value: String(rep),                    inline: true },
                        { name: '🐾 Pet',        value: pet ? `${pet.name} Lvl ${pet.level}` : 'None', inline: true },
                        { name: '💍 Married To', value: married ? `<@${married}>` : 'Single', inline: true },
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
                await interaction.reply({ content: `**🏆 Top 10 Richest Players**\n\n${top || 'No players yet'}` });
                return;
            }

            // ─── WORDLE ────────────────────────────────────────────
            if (interaction.commandName === 'wordle') {
                const guess     = String(interaction.options.getString('guess')).toLowerCase();
                const channelId = String(interaction.channelId);

                if (!wordleGames.has(channelId)) {
                    const word = WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)];
                    wordleGames.set(channelId, { word, guesses: [], maxGuesses: 6, startTime: Date.now() });
                }

                const game = wordleGames.get(channelId);

                if (guess.length !== 5 || !/^[a-z]+$/.test(guess)) {
                    await interaction.reply({ content: '❌ Must be exactly 5 letters (a-z)', ephemeral: true });
                    return;
                }

                const result = evaluateGuess(game.word, guess);
                game.guesses.push({ guess, result });

                let board = '';
                for (const { guess: g, result: r } of game.guesses) {
                    board += r.join('') + '  `' + g.toUpperCase().split('').join(' ') + '`\n';
                }

                const embed = new EmbedBuilder()
                    .setTitle('🟩 Wordle')
                    .setDescription(board)
                    .setColor(guess === game.word ? 0x57F287 : 0x7289DA);

                if (guess === game.word) {
                    embed.setFooter({ text: `🎉 Solved in ${game.guesses.length} guess${game.guesses.length === 1 ? '' : 'es'}!` });
                    addCoins(userId, 500);
                    addXP(userId, 250);
                    await saveData();
                    wordleGames.delete(channelId);
                } else if (game.guesses.length >= game.maxGuesses) {
                    embed.setFooter({ text: `Game over! The word was: ${game.word.toUpperCase()}` });
                    wordleGames.delete(channelId);
                } else {
                    embed.setFooter({ text: `${game.maxGuesses - game.guesses.length} guess${game.guesses.length === 1 ? '' : 'es'} left` });
                }

                await interaction.reply({ embeds: [embed] });
                return;
            }


    // ─── TRIVIA ────────────────────────────────────────────
            if (interaction.commandName === 'trivia') {
                const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`trivia_${userId}_${Date.now()}`)
                        .setPlaceholder('Choose your answer...')
                        .addOptions(q.options.map(opt => ({
                            label: opt.charAt(0).toUpperCase() + opt.slice(1),
                            value: opt,
                        }))),
                );

                await interaction.reply({ content: `**🧠 ${q.q}**`, components: [row] });

                const msg       = await interaction.fetchReply();
                const collector = msg.createMessageComponentCollector({ time: 30_000 });
                let answered    = false;

                collector.on('collect', async sel => {
                    if (!sel.customId.includes(userId)) {
                        await sel.reply({ content: '❌ This is not your trivia question!', ephemeral: true });
                        return;
                    }
                    if (answered) return;
                    answered = true;

                    const answer = sel.values[0];
                    if (answer === q.a) {
                        addCoins(userId, 250);
                        addXP(userId, 100);
                        await saveData();
                        await sel.reply({ content: `✅ Correct! **+250 coins** and **+100 XP**!`, ephemeral: true });
                    } else {
                        await sel.reply({ content: `❌ Wrong! The answer was **${q.a}**`, ephemeral: true });
                    }
                    collector.stop();
                });

                collector.on('end', async () => {
                    if (!answered) {
                        await interaction.editReply({ content: `**🧠 ${q.q}**\n⏰ Time's up! The answer was **${q.a}**`, components: [] }).catch(() => {});
                    } else {
                        await interaction.editReply({ components: [] }).catch(() => {});
                    }
                });

                return;
            }

            // ─── SLOTS ─────────────────────────────────────────────
            if (interaction.commandName === 'slots') {
                const bet = interaction.options.getInteger('bet');
                if (coins(userId) < bet) {
                    await interaction.reply({ content: `❌ Not enough coins (need **${bet}**, have **${coins(userId)}**)`, ephemeral: true });
                    return;
                }
                const slots    = playSlotsOnce();
                const winnings = calculateSlotWinnings(slots, bet);
                addCoins(userId, -bet + winnings);
                addXP(userId, Math.floor(bet / 10));
                await saveData();

                await interaction.reply({
                    content: winnings > 0
                        ? `🎰 **${slots.join(' ')}** — 🎉 WIN! **+${winnings} coins**!`
                        : `🎰 **${slots.join(' ')}** — 💸 Loss! -${bet} coins`,
                });
                return;
            }

            // ─── BLACKJACK ─────────────────────────────────────────
            if (interaction.commandName === 'blackjack') {
                const bet = interaction.options.getInteger('bet');
                if (coins(userId) < bet) {
                    await interaction.reply({ content: '❌ Not enough coins!', ephemeral: true });
                    return;
                }

                const playerHand  = [drawCard(), drawCard()];
                const dealerHand  = [drawCard(), drawCard()];
                const playerValue = getHandValue(playerHand);
                const dealerValue = getHandValue(dealerHand);

                let outcome, winnings = 0;
                if (playerValue > 21)        { outcome = `💥 Bust! You went over 21.`;            winnings = 0;      }
                else if (dealerValue > 21)   { outcome = `🎉 Dealer busted! You win!`;            winnings = bet * 2; }
                else if (playerValue > dealerValue) { outcome = `✅ You win!`;                    winnings = bet * 2; }
                else if (dealerValue > playerValue) { outcome = `❌ Dealer wins.`;                winnings = 0;      }
                else                         { outcome = `🤝 Push! Bet returned.`;               winnings = bet;    }

                addCoins(userId, -bet + winnings);
                addXP(userId, 50);
                await saveData();

                const embed = new EmbedBuilder()
                    .setColor(winnings > bet ? 0x57F287 : winnings === bet ? 0xFEE75C : 0xED4245)
                    .setTitle('🃏 Blackjack')
                    .addFields(
                        { name: 'Your Hand',   value: `${playerHand.join(' ')} = **${playerValue}**`, inline: true },
                        { name: 'Dealer Hand', value: `${dealerHand.join(' ')} = **${dealerValue}**`, inline: true },
                        { name: 'Result',      value: outcome },
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
                const best    = [...weapons].sort((a, b) => (Number(b?.damage) || 0) - (Number(a?.damage) || 0))[0] || { damage: 20 };
                const damage  = Math.max(1, Number(best.damage) + Math.floor(Math.random() * 50));

                boss.health = Math.max(0, boss.health - damage);
                addCoins(userId, Math.floor(damage / 2));

                if (boss.health <= 0) {
                    const reward = Math.floor(damage * 2);
                    addCoins(userId, reward);
                    addXP(userId, reward);
                    await saveData();
                    boss = null;
                    await interaction.reply({ content: `🎊 **Boss defeated!** You earned **${reward} coins** and **${reward} XP**! 🔥` });
                    return;
                }

                await saveData();
                const bar = buildBar(boss.health, boss.maxHealth);
                await interaction.reply({ content: `⚔️ You dealt **${damage}** damage!\n${boss.name}: \`${bar}\` ${boss.health}/${boss.maxHealth} HP` });
                return;
            }

            // ─── 8BALL ─────────────────────────────────────────────
            if (interaction.commandName === '8ball') {
                const question  = interaction.options.getString('question');
                const responses = [
                    'Yes, definitely! 🎯', 'No way! ❌', 'Maybe... 🤔', 'Ask again later 🔮',
                    'Absolutely! ✅', 'Highly unlikely 😬', 'Signs point to yes 👍',
                    "Don't count on it 👎", 'Outlook good! 😊', 'Very doubtful 😕',
                ];
                await interaction.reply({ content: `🎱 **${question}**\n\n${responses[Math.floor(Math.random() * responses.length)]}` });
                return;
            }

            // ─── FNF ──────────────────────────────────────────────
            if (interaction.commandName === 'fnf') {
                // Block if already in a game
                if (fnfGames.has(userId)) {
                    await interaction.reply({ content: '❌ You already have an FNF game running! Finish it first.', ephemeral: true });
                    return;
                }

                const difficulty = interaction.options.getString('difficulty');
                const diff       = FNF_DIFFICULTIES[difficulty];
                const song       = FNF_SONGS[Math.floor(Math.random() * FNF_SONGS.length)];
                const sequence   = buildFnfSequence(diff.arrows);
                const gameId     = `${userId}-${Date.now()}`;

                const game = {
                    userId,
                    gameId,
                    difficulty,
                    song,
                    sequence,
                    currentIndex: 0,
                    hits:         0,
                    misses:       0,
                    score:        0,
                    health:       diff.maxHealth,
                    arrowTimeout: null,
                    currentMessage: null,
                };
                fnfGames.set(userId, game);

                // Start screen
                const startEmbed = new EmbedBuilder()
                    .setColor(diff.color)
                    .setTitle('🎵 Friday Night Funkin\'!')
                    .setDescription(
                        `**Difficulty:** ${diff.label}\n` +
                        `**Song:** ${song}\n\n` +
                        `**Rules:**\n` +
                        `• Hit the arrow shown by pressing the matching button\n` +
                        `• You have **${diff.timeMs / 1000}s** per arrow\n` +
                        `• Max misses: **${diff.maxMisses === 0 ? 'ZERO (one miss = instant fail!)' : diff.maxMisses}**\n` +
                        (difficulty === 'nightmare' ? `\n⚠️ **NIGHTMARE MODE: One single miss and you lose ALL your points!**` : '') +
                        `\n\nGet ready... GO!`
                    )
                    .setFooter({ text: `${diff.arrows} arrows total` });

                await interaction.reply({ embeds: [startEmbed] });
                await new Promise(r => setTimeout(r, 2000));

                // Kick off the first arrow
                await fnfNextArrow(interaction, game);
                return;
            }

            // ─── MARRY ─────────────────────────────────────────────
            if (interaction.commandName === 'marry') {
                const target = interaction.options.getUser('user');
                if (!target || target.bot || target.id === userId) {
                    await interaction.reply({ content: '❌ Invalid target!', ephemeral: true });
                    return;
                }
                if (userData.married.get(userId)) {
                    await interaction.reply({ content: "❌ You're already married! Use `/divorce` first.", ephemeral: true });
                    return;
                }
                const tid = String(target.id);
                if (userData.married.get(tid)) {
                    await interaction.reply({ content: `❌ **${target.username}** is already married!`, ephemeral: true });
                    return;
                }
                userData.married.set(userId, tid);
                userData.married.set(tid, userId);
                addCoins(userId, 1000);
                addCoins(tid, 1000);
                await saveData();
                await interaction.reply({ content: `💍 **${interaction.user.username}** married **${target.username}**! Congrats! **+1000 coins** for both! 🎉` });
                return;
            }

            // ─── DIVORCE ───────────────────────────────────────────
            if (interaction.commandName === 'divorce') {
                const spouse = userData.married.get(userId);
                if (!spouse) {
                    await interaction.reply({ content: "❌ You're not married!", ephemeral: true });
                    return;
                }
                userData.married.delete(userId);
                userData.married.delete(spouse);
                await saveData();
                await interaction.reply({ content: `💔 You're now divorced. It's not you, it's me...` });
                return;
            }


                    // ─── REP ───────────────────────────────────────────────
            if (interaction.commandName === 'rep') {
                const target = interaction.options.getUser('user');
                if (!target || target.id === userId) {
                    await interaction.reply({ content: "❌ Can't rep yourself!", ephemeral: true });
                    return;
                }
                const remaining = cooldownManager.get(userId, 'rep');
                if (remaining) {
                    const h = Math.ceil(remaining / 3_600_000);
                    await interaction.reply({ content: `⏰ You can give rep again in **${h}h**`, ephemeral: true });
                    return;
                }
                const tid = String(target.id);
                userData.rep.set(tid, (Number(userData.rep.get(tid)) || 0) + 1);
                cooldownManager.set(userId, 'rep', 86_400_000);
                await saveData();
                await interaction.reply({ content: `👍 Gave rep to **${target.username}**!` });
                return;
            }

            // ─── ADOPT ─────────────────────────────────────────────
            if (interaction.commandName === 'adopt') {
                if (userData.pets.get(userId)) {
                    await interaction.reply({ content: '❌ You already have a pet! Pets are loyal — only one at a time.', ephemeral: true });
                    return;
                }
                const petChoice = interaction.options.getString('pet');
                const pet       = PETS.find(p => p.id === petChoice);
                if (!pet) {
                    await interaction.reply({ content: '❌ Invalid pet choice!', ephemeral: true });
                    return;
                }
                if (coins(userId) < pet.price) {
                    await interaction.reply({ content: `❌ Not enough coins (need **${pet.price}**)`, ephemeral: true });
                    return;
                }
                addCoins(userId, -pet.price);
                userData.pets.set(userId, { id: pet.id, name: pet.name, xp: 0, level: 1 });
                await saveData();
                await interaction.reply({ content: `🐾 You adopted a **${pet.name}**! It's so happy to meet you! 🎉` });
                return;
            }

            // ─── PET CHECK ─────────────────────────────────────────
            if (interaction.commandName === 'pet') {
                const pet = userData.pets.get(userId);
                if (!pet) {
                    await interaction.reply({ content: "❌ You don't have a pet! Use `/adopt` to get one.", ephemeral: true });
                    return;
                }
                const embed = new EmbedBuilder()
                    .setColor(0xFF69B4)
                    .setTitle(pet.name)
                    .addFields(
                        { name: 'Level',  value: `⭐ **${pet.level}**`,   inline: true },
                        { name: 'XP',     value: `📊 **${pet.xp}**`,      inline: true },
                        { name: 'Status', value: '😊 Happy & Healthy',    inline: true },
                    );
                await interaction.reply({ embeds: [embed] });
                return;
            }

            // ─── FISH ──────────────────────────────────────────────
            if (interaction.commandName === 'fish') {
                const rem = cooldownManager.get(userId, 'fish');
                if (rem) {
                    const m = Math.ceil(rem / 60_000);
                    await interaction.reply({ content: `⏰ Fishing cooldown! Come back in **${m}m**`, ephemeral: true });
                    return;
                }
                const catch_  = Math.random() > 0.3;
                const amount  = catch_ ? Math.floor(Math.random() * 500) + 200 : 0;
                if (catch_) { addCoins(userId, amount); addXP(userId, 40); }

                // Pet XP bonus
                const pet = userData.pets.get(userId);
                if (pet) { pet.xp = (pet.xp || 0) + 10; userData.pets.set(userId, pet); }

                cooldownManager.set(userId, 'fish', 600_000);
                await saveData();
                await interaction.reply({
                    content: catch_
                        ? `🎣 You reeled in a catch worth **${amount} coins**! 🐟${pet ? ' Your pet helped out!' : ''}`
                        : '🎣 Nothing biting today... try again in 10 minutes.',
                });
                return;
            }

            // ─── MINE ──────────────────────────────────────────────
            if (interaction.commandName === 'mine') {
                const rem = cooldownManager.get(userId, 'mine');
                if (rem) {
                    const m = Math.ceil(rem / 60_000);
                    await interaction.reply({ content: `⏰ Mining cooldown! Come back in **${m}m**`, ephemeral: true });
                    return;
                }
                const found  = Math.random() > 0.2;
                const amount = found ? Math.floor(Math.random() * 600) + 300 : 0;
                if (found) { addCoins(userId, amount); addXP(userId, 50); }
                cooldownManager.set(userId, 'mine', 900_000);
                await saveData();
                await interaction.reply({
                    content: found
                        ? `⛏️ Struck gold! Mined **${amount} coins** worth of ore!`
                        : '⛏️ Hit a dead end. Better luck next time.',
                });
                return;
            }

            // ─── WARN ──────────────────────────────────────────────
            if (interaction.commandName === 'warn') {
                if (!await staffOnly(interaction, isStaff)) return;
                const target = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason');
                if (!target) { await interaction.reply({ content: '❌ User not found', ephemeral: true }); return; }
                const tid = String(target.id);
                if (!userData.warnings.has(tid)) userData.warnings.set(tid, []);
                userData.warnings.get(tid).push({ reason, at: new Date().toISOString(), by: interaction.user.username });
                await saveData();

                // Log to mod-log channel if configured
                const logCfg = logsConfig[String(interaction.guildId)];
                if (logCfg?.channelId) {
                    const logCh = await interaction.guild.channels.fetch(logCfg.channelId).catch(() => null);
                    if (logCh) {
                        await logCh.send({ embeds: [
                            new EmbedBuilder()
                                .setColor(0xFEE75C)
                                .setTitle('⚠️ User Warned')
                                .addFields(
                                    { name: 'User',   value: `<@${tid}>`, inline: true },
                                    { name: 'By',     value: `<@${userId}>`, inline: true },
                                    { name: 'Reason', value: reason },
                                )
                                .setTimestamp(),
                        ] }).catch(() => {});
                    }
                }

                await interaction.reply({ content: `⚠️ Warned **${target.username}** for: ${reason}` });
                return;
            }

            // ─── WARNINGS ──────────────────────────────────────────
            if (interaction.commandName === 'warnings') {
                if (!await staffOnly(interaction, isStaff)) return;
                const target = interaction.options.getUser('user');
                if (!target) { await interaction.reply({ content: '❌ User not found', ephemeral: true }); return; }
                const warns = userData.warnings.get(String(target.id)) || [];
                if (!warns.length) {
                    await interaction.reply({ content: `✅ **${target.username}** has no warnings.`, ephemeral: true });
                    return;
                }
                const embed = new EmbedBuilder()
                    .setColor(0xFEE75C)
                    .setTitle(`⚠️ Warnings for ${target.username}`)
                    .setDescription(warns.map((w, i) => `**${i + 1}.** ${w.reason}\n> by ${w.by} on ${w.at.slice(0, 10)}`).join('\n\n'));
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // ─── MUTE (Discord Timeout) ────────────────────────────
            if (interaction.commandName === 'mute') {
                if (!await staffOnly(interaction, isStaff)) return;
                const target      = interaction.options.getUser('user');
                const durationMin = interaction.options.getInteger('duration');
                if (!target) { await interaction.reply({ content: '❌ User not found', ephemeral: true }); return; }
                if (target.bot)   { await interaction.reply({ content: '❌ Cannot mute bots!', ephemeral: true }); return; }

                try {
                    const member = await interaction.guild.members.fetch(target.id);
                    await member.disableCommunicationUntil(
                        Date.now() + durationMin * 60_000,
                        `Muted by ${interaction.user.username}`,
                    );

                    // Log to mod-log
                    const logCfg = logsConfig[String(interaction.guildId)];
                    if (logCfg?.channelId) {
                        const logCh = await interaction.guild.channels.fetch(logCfg.channelId).catch(() => null);
                        if (logCh) {
                            await logCh.send({ embeds: [
                                new EmbedBuilder()
                                    .setColor(0xED4245)
                                    .setTitle('🤐 User Timed Out')
                                    .addFields(
                                        { name: 'User',     value: `<@${target.id}>`, inline: true },
                                        { name: 'By',       value: `<@${userId}>`,    inline: true },
                                        { name: 'Duration', value: `${durationMin} minute(s)`, inline: true },
                                    )
                                    .setTimestamp(),
                            ] }).catch(() => {});
                        }
                    }

                    await interaction.reply({ content: `🤐 **${target.username}** timed out for **${durationMin} minute(s)**` });
                } catch (e) {
                    console.error('Mute error:', e?.message);
                    await interaction.reply({
                        content: '❌ Failed to mute. Make sure the bot has **Moderate Members** permission and the target is not a moderator/admin.',
                        ephemeral: true,
                    });
                }
                return;
            }

            // ─── UNMUTE ────────────────────────────────────────────
            if (interaction.commandName === 'unmute') {
                if (!await staffOnly(interaction, isStaff)) return;
                const target = interaction.options.getUser('user');
                if (!target) { await interaction.reply({ content: '❌ User not found', ephemeral: true }); return; }

                try {
                    const member = await interaction.guild.members.fetch(target.id);
                    if (!member.communicationDisabledUntil) {
                        await interaction.reply({ content: '❌ User is not currently timed out!', ephemeral: true });
                        return;
                    }
                    await member.disableCommunicationUntil(null, `Unmuted by ${interaction.user.username}`);
                    await interaction.reply({ content: `🔊 **${target.username}** has been unmuted!` });
                } catch (e) {
                    console.error('Unmute error:', e?.message);
                    await interaction.reply({ content: '❌ Failed to unmute. Check bot permissions.', ephemeral: true });
                }
                return;
            }

            // ─── SETLOGS ───────────────────────────────────────────
            if (interaction.commandName === 'setlogs') {
                if (!await staffOnly(interaction, isStaff)) return;
                const channel = interaction.options.getChannel('channel');
                logsConfig[String(interaction.guildId)] = { channelId: channel.id };
                await saveData();
                await interaction.reply({ content: `📋 Mod-log channel set to <#${channel.id}>`, ephemeral: true });
                return;
            }

            // ─── SETWELCOME ────────────────────────────────────────
            if (interaction.commandName === 'setwelcome') {
                if (!await staffOnly(interaction, isStaff)) return;
                const channel = interaction.options.getChannel('channel');
                const role    = interaction.options.getRole('role');
                welcomeConfig[String(interaction.guildId)] = {
                    channelId: channel.id,
                    roleId:    role?.id || null,
                    message:   `Welcome to ${interaction.guild.name}!`,
                };
                await saveData();
                await interaction.reply({
                    content: `👋 Welcome channel set to <#${channel.id}>${role ? ` with auto-role <@&${role.id}>` : ''}`,
                    ephemeral: true,
                });
                return;
            }

            // ─── SETTICKETS ────────────────────────────────────────
            if (interaction.commandName === 'settickets') {
                if (!await staffOnly(interaction, isStaff)) return;
                const channel = interaction.options.getChannel('channel');
                ticketConfig[String(interaction.guildId)] = { channelId: channel.id };
                await saveData();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_ticket')
                        .setLabel('🎫 Open a Ticket')
                        .setStyle(ButtonStyle.Primary),
                );
                const ticketCh = await interaction.guild.channels.fetch(channel.id).catch(() => null);
                if (ticketCh) {
                    await ticketCh.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x5865F2)
                                .setTitle('🎫 Support Tickets')
                                .setDescription('Need help? Click the button below to open a private support ticket.'),
                        ],
                        components: [row],
                    }).catch(() => {});
                }

                await interaction.reply({ content: `🎫 Ticket panel posted in <#${channel.id}>`, ephemeral: true });
                return;
            }


                    // ─── SETSUGGESTIONS ────────────────────────────────────
            if (interaction.commandName === 'setsuggestions') {
                if (!await staffOnly(interaction, isStaff)) return;
                const channel = interaction.options.getChannel('channel');
                suggestionConfig[String(interaction.guildId)] = { channelId: channel.id };
                await saveData();
                await interaction.reply({ content: `💡 Suggestion channel set to <#${channel.id}>`, ephemeral: true });
                return;
            }

            // ─── ADDXP (OWNER) ────────────────────────────────────
            if (interaction.commandName === 'addxp') {
                if (!await ownerOnly(interaction, isOwner)) return;
                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('amount');
                if (!target) { await interaction.reply({ content: '❌ User not found', ephemeral: true }); return; }
                addXP(String(target.id), amount);
                await saveData();
                await interaction.reply({ content: `⭐ Added **${amount} XP** to <@${target.id}>` });
                return;
            }

            // ─── ADDCOINS (OWNER) ──────────────────────────────────
            if (interaction.commandName === 'addcoins') {
                if (!await ownerOnly(interaction, isOwner)) return;
                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('amount');
                if (!target) { await interaction.reply({ content: '❌ User not found', ephemeral: true }); return; }
                addCoins(String(target.id), amount);
                await saveData();
                await interaction.reply({ content: `💰 Added **${amount} coins** to <@${target.id}>` });
                return;
            }

            // ─── ADDSTAFF (OWNER) ──────────────────────────────────
            if (interaction.commandName === 'addstaff') {
                if (!await ownerOnly(interaction, isOwner)) return;
                const target = interaction.options.getUser('user');
                if (!target) { await interaction.reply({ content: '❌ User not found', ephemeral: true }); return; }
                staffSet.add(String(target.id));
                await saveData();
                await interaction.reply({ content: `👮 **${target.username}** is now staff!` });
                return;
            }

            // ─── ADDRESPONSE (OWNER) ───────────────────────────────
            if (interaction.commandName === 'addresponse') {
                if (!await ownerOnly(interaction, isOwner)) return;
                const trigger  = String(interaction.options.getString('trigger')).toLowerCase();
                const response = String(interaction.options.getString('response'));
                autoResponses.set(trigger, response);
                await saveData();
                await interaction.reply({ content: `✅ Auto-response added: **"${trigger}"** → "${response}"`, ephemeral: true });
                return;
            }

        } catch (cmdErr) {
            console.error('❌ Command error:', cmdErr?.message, cmdErr?.stack);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ Something went wrong. Try again!', ephemeral: true });
                }
            } catch (e) { console.error('Failed to reply after error:', e?.message); }
        }

    } catch (mainErr) {
        console.error('❌ Interaction handler error:', mainErr?.message);
    }
});

// ════════════════════════════════════════════════════════════════
// ♦️ FNF BUTTON HANDLER
// ════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('fnf_')) return;

    try {
        // customId format: fnf_<gameId>_<arrow>
        const parts    = interaction.customId.split('_');
        // gameId is userId-timestamp, arrow is the last segment
        const pressed  = parts[parts.length - 1]; // e.g. "⬅️"
        const userId   = String(interaction.user.id);
        const game     = fnfGames.get(userId);

        // Immediately defer the button so Discord doesn't show "Interaction failed"
        await interaction.deferUpdate().catch(() => {});

        if (!game) return; // Game already ended

        // Make sure this button belongs to this player's game
        if (!interaction.customId.includes(game.gameId)) return;

        // Cancel the per-arrow timeout since player responded
        clearTimeout(game.arrowTimeout);

        const target = game.sequence[game.currentIndex];
        const diff   = FNF_DIFFICULTIES[game.difficulty];

        if (pressed === target) {
            // CORRECT HIT
            game.hits++;
            game.score += Math.floor(100 * (diff.arrows / 6)); // harder = more points per hit

            // Brief hit feedback
            const hitEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ HIT!')
                .setDescription(`**${target}** — Nice!

Score: **${game.score}**`);
            await interaction.editReply({ embeds: [hitEmbed], components: [] }).catch(() => {});
            await new Promise(r => setTimeout(r, 600));

            game.currentIndex++;
            if (game.currentIndex >= game.sequence.length) {
                await fnfEndGame(interaction, game, true, '✅ You cleared every arrow!');
            } else {
                await fnfNextArrow(interaction, game);
            }
        } else {
            // WRONG ARROW
            await fnfHandleMiss(interaction, game, 'wrong');
        }
    } catch (e) {
        console.error('FNF button error:', e?.message);
    }
});

// ════════════════════════════════════════════════════════════════
// ♦️ TICKET BUTTON HANDLER
// ════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'open_ticket') return;
    try {
        const guildId = String(interaction.guildId);
        const cfg     = ticketConfig[guildId];
        if (!cfg) return;

        const ticketName = `ticket-${interaction.user.username.toLowerCase().replace(/\s/g, '-')}`;
        const existing   = interaction.guild.channels.cache.find(c => c.name === ticketName);
        if (existing) {
            await interaction.reply({ content: `❌ You already have an open ticket: <#${existing.id}>`, ephemeral: true });
            return;
        }

        const channel = await interaction.guild.channels.create({
            name:       ticketName,
            type:       ChannelType.GuildText,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ],
        });

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('🔒 Close Ticket')
                .setStyle(ButtonStyle.Danger),
        );

        await channel.send({
            content: `<@${interaction.user.id}> Welcome to your support ticket!`,
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🎫 Support Ticket')
                    .setDescription('Please describe your issue and a staff member will assist you shortly.'),
            ],
            components: [closeRow],
        });

        await interaction.reply({ content: `✅ Ticket opened: <#${channel.id}>`, ephemeral: true });
    } catch (e) {
        console.error('Ticket open error:', e?.message);
        await interaction.reply({ content: '❌ Failed to create ticket. Check bot permissions (Manage Channels).', ephemeral: true }).catch(() => {});
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'close_ticket') return;
    try {
        await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    } catch (e) {
        console.error('Ticket close error:', e?.message);
    }
});

// ════════════════════════════════════════════════════════════════
// ♦️ MESSAGE HANDLER — auto-responses, XP on message
// ════════════════════════════════════════════════════════════════

client.on('messageCreate', async message => {
    try {
        if (message.author.bot) return;

        const userId  = String(message.author.id);
        const content = message.content.toLowerCase();

        // Auto-responses
        for (const [trigger, response] of autoResponses) {
            if (content.includes(trigger)) {
                await message.reply(response).catch(() => {});
                break; // Only one response per message
            }
        }

        // XP on message (10s cooldown)
        if (!cooldownManager.has(userId, 'message_xp')) {
            const result = addXP(userId, 5);
            cooldownManager.set(userId, 'message_xp', 10_000);

            // Level-up announcement
            if (result.leveledUp) {
                const info = getLevelInfo(userData.xp.get(userId));
                await message.channel.send(`🎉 <@${userId}> leveled up to **Level ${info.level}**! 🎊`).catch(() => {});
            }

            await saveData();
        }
    } catch (e) {
        console.error('Message error:', e?.message);
    }
});

// ════════════════════════════════════════════════════════════════
// ♦️ WELCOME SYSTEM
// ════════════════════════════════════════════════════════════════

client.on('guildMemberAdd', async member => {
    try {
        const cfg = welcomeConfig[String(member.guild.id)];
        if (!cfg) return;

        if (cfg.roleId) {
            await member.roles.add(cfg.roleId).catch(e => console.error('Role add error:', e?.message));
        }

        const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
        if (!channel) return;

        await channel.send({
            content: `Welcome <@${member.id}>! 🎉`,
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('👋 Welcome!')
                    .setDescription(cfg.message || `Welcome to **${member.guild.name}**!`)
                    .setThumbnail(member.user.displayAvatarURL())
                    .setFooter({ text: `You are member #${member.guild.memberCount}` }),
            ],
        });
    } catch (e) {
        console.error('Welcome error:', e?.message);
    }
});

// ════════════════════════════════════════════════════════════════
// ♦️ WORDLE & GAME CLEANUP
// ════════════════════════════════════════════════════════════════

setInterval(() => {
    const now     = Date.now();
    const expired = [];
    for (const [id, game] of wordleGames) {
        if (now - game.startTime > WORDLE_TIMEOUT) expired.push(id);
    }
    expired.forEach(id => wordleGames.delete(id));
    if (expired.length) console.log(`🧹 Cleaned ${expired.length} stale Wordle game(s)`);

    // FNF cleanup — if a game has been sitting > 2 minutes with no activity, kill it
    // (normally games self-terminate via their own arrow timeouts, this is a safety net)
    const fnfExpired = [];
    for (const [uid, game] of fnfGames) {
        if (now - parseInt(game.gameId.split('-')[1] || '0') > 120_000) {
            clearTimeout(game.arrowTimeout);
            fnfExpired.push(uid);
        }
    }
    fnfExpired.forEach(uid => fnfGames.delete(uid));
    if (fnfExpired.length) console.log(`🧹 Cleaned ${fnfExpired.length} stale FNF game(s)`);
}, CLEANUP_INTERVAL);

// ════════════════════════════════════════════════════════════════
// ♦️ ERROR HANDLERS
// ════════════════════════════════════════════════════════════════

process.on('unhandledRejection', err => console.error('⚠️ Unhandled Rejection:', err?.message || err));
process.on('uncaughtException',  err => console.error('⚠️ Uncaught Exception:',  err?.message || err));
client.on('error', err => console.error('⚠️ Client error:', err?.message || err));
client.on('warn',  warn => console.warn('⚠️ Warning:', warn));

// ════════════════════════════════════════════════════════════════
// ♦️ GRACEFUL SHUTDOWN
// ════════════════════════════════════════════════════════════════

async function gracefulShutdown() {
    console.log('🔴 Shutting down...');
    try {
        await saveData();
        cooldownManager.destroy();
        client.destroy();
        console.log('✅ Clean shutdown');
        process.exit(0);
    } catch (e) {
        console.error('❌ Shutdown error:', e?.message);
        process.exit(1);
    }
}

process.on('SIGINT',  gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ════════════════════════════════════════════════════════════════
// ♦️ BOOT
// ════════════════════════════════════════════════════════════════

if (!process.env.TOKEN) {
    console.error('❌ TOKEN not set in environment variables!');
    process.exit(1);
}

(async () => {
    await loadData();
    setInterval(saveData, 300_000); // Auto-save every 5 min
    client.login(process.env.TOKEN).catch(err => {
        console.error('❌ Login failed:', err?.message);
        process.exit(1);
    });
    console.log('🚀 Bot starting...');
})();

                    
