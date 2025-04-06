const Discord = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

// Initialisation du client Discord
const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMembers,
        Discord.GatewayIntentBits.GuildVoiceStates,
        Discord.GatewayIntentBits.GuildInvites
    ]
});

// Configuration
const DATA_FILE = './activity.json';
const SAVE_INTERVAL = 2 * 30 * 500; // 5 minutes
const VOICE_UPDATE_INTERVAL = 30 * 500; // 1 minute

// Données d'activité
let activity = {};

// Charger les données existantes
if (fs.existsSync(DATA_FILE)) {
    try {
        activity = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('Erreur de lecture du fichier de données:', err);
    }
}

// Système de rangs
const RANKS = [
    { name: "🥋| Rang•E", voice: 60, messages: 10, invites: 1 },
    { name: "🛡️| Rang•D", voice: 300, messages: 20, invites: 2 },
    { name: "⚔️| Rang•C", voice: 600, messages: 80, invites: 3 },
    { name: "🏹| Rang•B", voice: 900, messages: 100, invites: 5 },
    { name: "🗡️| Rang•A", voice: 1200, messages: 120, invites: 7 },
    { name: "🍷| Rang•S", voice: 1560, messages: 160, invites: 11 },
    { name: "👑| Rang•Nation", voice: 1660, messages: 330, invites: 20 }
];

// Cache des invitations (déplacé en haut du fichier)
const inviteCache = new Map();

// Fonction pour attribuer les rôles
async function assignRank(member, rankName) {
    try {
        const role = member.guild.roles.cache.find(r => r.name === rankName);
        if (!role) {
            console.error(`Rôle ${rankName} introuvable`);
            return;
        }

        // Vérifier si l'utilisateur a déjà un rang
        const currentRankRole = member.roles.cache.find(r => 
            RANKS.some(rank => rank.name === r.name)
        );

        // Si l'utilisateur a déjà un rang et que ce n'est pas le nouveau rang
        if (currentRankRole && currentRankRole.name !== rankName) {
            await member.roles.remove(currentRankRole);
            console.log(`[ROLE] ${member.user.tag} a perdu le rôle ${currentRankRole.name}`);
        }

        // Si l'utilisateur n'a pas déjà le nouveau rang
        if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            console.log(`[ROLE] ${member.user.tag} a reçu le rôle ${rankName}`);
        }
    } catch (err) {
        console.error(`Erreur attribution rôle ${rankName} à ${member.user.tag}:`, err);
    }
}

// Fonction pour déterminer le rang actuel (le plus haut atteint)
function getCurrentRank(userData) {
    let highestRank = null;
    
    for (const rank of RANKS) {
        if (userData.voice >= rank.voice && 
            userData.messages >= rank.messages && 
            userData.invites >= rank.invites) {
            highestRank = rank;
        }
    }
    
    return highestRank;
}

// Fonction pour déterminer le prochain rang à atteindre
function getNextRank(userData) {
    const currentRank = getCurrentRank(userData);
    
    if (!currentRank) {
        return RANKS[0]; // Retourne le premier rang si aucun n'est atteint
    }
    
    const currentIndex = RANKS.findIndex(r => r.name === currentRank.name);
    if (currentIndex < RANKS.length - 1) {
        return RANKS[currentIndex + 1];
    }
    
    return null; // Pas de prochain rang si déjà au maximum
}

// Formatage du temps
function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h${mins}m`;
}

// Suivi des sessions vocales
const voiceSessions = new Map();

// Sauvegarder les données
function saveData() {
    fs.writeFile(DATA_FILE, JSON.stringify(activity, null, 2), (err) => {
        if (err) console.error('Erreur de sauvegarde:', err);
        else console.log('Données sauvegardées');
    });
}

// Mettre à jour le temps vocal
function updateVoiceTime() {
    const now = Date.now();
    
    voiceSessions.forEach((session, userId) => {
        const elapsed = now - session.lastUpdate;
        if (elapsed >= 60000) {
            const minutes = Math.floor(elapsed / 60000);
            
            if (!activity[session.guildId]) activity[session.guildId] = {};
            if (!activity[session.guildId][userId]) {
                activity[session.guildId][userId] = { messages: 0, voice: 0, invites: 0 };
            }
            
            activity[session.guildId][userId].voice += minutes;
            session.lastUpdate = now - (elapsed % 60000);
            
            console.log(`[VOICE] ${userId} +${minutes}min (Total: ${activity[session.guildId][userId].voice}min)`);
            
            // Vérifier si un nouveau rang doit être attribué
            const guild = client.guilds.cache.get(session.guildId);
            if (guild) {
                const member = guild.members.cache.get(userId);
                if (member) {
                    const userData = activity[session.guildId][userId];
                    const currentRank = getCurrentRank(userData);
                    if (currentRank) {
                        assignRank(member, currentRank.name);
                    }
                }
            }
        }
    });
}

// Minuteurs
setInterval(updateVoiceTime, VOICE_UPDATE_INTERVAL);
setInterval(saveData, SAVE_INTERVAL);

// Gestion des états vocaux
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.member?.id || oldState.member?.id;
    if (!userId || userId === client.user.id) return;

    const guildId = newState.guild.id;

    if (!oldState.channelId && newState.channelId) {
        voiceSessions.set(userId, {
            guildId: guildId,
            channelId: newState.channelId,
            lastUpdate: Date.now()
        });
        console.log(`[VOICE] ${userId} a rejoint le salon vocal`);
    }
    else if (oldState.channelId && !newState.channelId) {
        updateVoiceTime();
        voiceSessions.delete(userId);
        console.log(`[VOICE] ${userId} a quitté le salon vocal`);
    }
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        updateVoiceTime();
        voiceSessions.set(userId, {
            guildId: guildId,
            channelId: newState.channelId,
            lastUpdate: Date.now()
        });
        console.log(`[VOICE] ${userId} a changé de salon vocal`);
    }
});

// Comptage des messages et attribution des rôles
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    if (!activity[guildId]) activity[guildId] = {};
    if (!activity[guildId][userId]) {
        activity[guildId][userId] = { messages: 0, voice: 0, invites: 0 };
    }

    activity[guildId][userId].messages++;
    console.log(`[MESSAGE] ${message.author.tag} a envoyé un message (Total: ${activity[guildId][userId].messages})`);

    // Vérifier si un nouveau rang doit être attribué
    const userData = activity[guildId][userId];
    const currentRank = getCurrentRank(userData);
    if (currentRank) {
        await assignRank(message.member, currentRank.name);
    }
});

// Commande +rank
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('+rank')) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    if (!activity[guildId] || !activity[guildId][userId]) {
        return message.reply("Vous n'avez pas encore d'activité enregistrée.");
    }

    const userData = activity[guildId][userId];
    const currentRank = getCurrentRank(userData);
    const nextRank = getNextRank(userData);

    const embed = new Discord.EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Progression de ${message.author.username}`)
        .setThumbnail(message.author.displayAvatarURL());

    if (currentRank) {
        embed.addFields({
            name: 'Rang actuel',
            value: currentRank.name,
            inline: true
        });
    }

    if (nextRank) {
        embed.addFields(
            {
                name: 'Messages',
                value: `${userData.messages}/${nextRank.messages}`,
                inline: true
            },
            {
                name: 'Temps vocal',
                value: `${formatTime(userData.voice)}/${formatTime(nextRank.voice)}`,
                inline: true
            },
            {
                name: 'Invitations',
                value: `${userData.invites}/${nextRank.invites}`,
                inline: true
            }
        );
    } else {
        embed.setDescription('🎉 Vous avez atteint le rang maximum!');
    }

    await message.channel.send({ embeds: [embed] });
});

// Gestion des invitations
client.on('guildMemberAdd', async (member) => {
    const guildId = member.guild.id;
    
    try {
        const invites = await member.guild.invites.fetch();
        const cachedInvites = inviteCache.get(guildId) || new Map();
        
        let usedInvite = null;
        for (const [code, invite] of invites) {
            if ((cachedInvites.get(code) || 0) < invite.uses) {
                usedInvite = invite;
                break;
            }
        }
        
        if (usedInvite && usedInvite.inviter) {
            const inviterId = usedInvite.inviter.id;
            
            if (!activity[guildId]) activity[guildId] = {};
            if (!activity[guildId][inviterId]) {
                activity[guildId][inviterId] = { messages: 0, voice: 0, invites: 0 };
            }
            
            activity[guildId][inviterId].invites++;
            console.log(`[INVITE] ${inviterId} a invité ${member.user.tag}`);
            
            // Attribuer le rang si nécessaire
            const userData = activity[guildId][inviterId];
            const currentRank = getCurrentRank(userData);
            if (currentRank) {
                const inviterMember = member.guild.members.cache.get(inviterId);
                if (inviterMember) {
                    await assignRank(inviterMember, currentRank.name);
                }
            }
        }
        
        inviteCache.set(guildId, new Map(invites.map(invite => [invite.code, invite.uses])));
    } catch (err) {
        console.error('Erreur suivi invitations:', err);
    }
});

client.on('ready', async () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    
    // Initialiser le cache des invitations pour chaque serveur
    for (const guild of client.guilds.cache.values()) {
        try {
            const invites = await guild.invites.fetch();
            inviteCache.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses])));
            console.log(`[INVITES] Cache initialisé pour ${guild.name}`);
        } catch (err) {
            console.error(`Erreur initialisation invitations ${guild.name}:`, err);
        }
    }
});

client.login(config.token);