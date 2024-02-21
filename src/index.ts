import 'dotenv/config';
import {
    Client, Intents, MessageButton, MessageActionRow, Message, MessageAttachment,
} from 'discord.js';
import { v4 as uuid } from 'uuid';
import tmp from 'tmp';
import Axios from 'axios';
import fs from 'fs';
import logger from './logger';
import obfuscate from './obfuscate';

// Load token from .env
const token = process.env.DISCORD_TOKEN;
const MAX_SIZE = 40000; // 40kB max size

// Define the channel ID where you want to send logs
const logChannelId = '1208781399339831377';

// Create Discord Bot Client
const client = new Client({
    intents: [
        Intents.FLAGS.DIRECT_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
    ],
    partials: ['CHANNEL'],
});

// Function to send log message to the designated channel
const sendLogToChannel = async (logMessage) => {
    try {
        const logChannel = await client.channels.fetch(logChannelId);
        if (logChannel && logChannel.isText()) {
            await logChannel.send(logMessage);
        } else {
            console.error("Log channel not found or is not a text channel.");
        }
    } catch (error) {
        console.error("Error while sending log message to channel:", error);
    }
};

// Function to log messages to console and server
const logToConsoleAndServer = async (message) => {
    console.log(message); // Log to console
    await sendLogToChannel(message); // Log to server
};

logger.log('Bot is starting ...');
logToConsoleAndServer('Bot is starting ...');

// Login using token
client.login(token);

client.once('ready', () => { // When the client is ready
    logger.log(`Logged in as ${(client.user?.tag || 'Unknown')}`);
    logToConsoleAndServer(`Logged in as ${(client.user?.tag || 'Unknown')}`);
});

interface ButtonInfo {
  url: string;
  preset: string;
  tag: string;
  message: Message,
  buttonIds: string[],
}

const buttonInfos = new Map<string, ButtonInfo>();

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) {
        return;
    }

    const buttonInfo = buttonInfos.get(interaction.customId);
    if (!buttonInfo) {
        interaction.update({
            embeds: [
                {
                    title: 'Obfuscator V2000',
                    description: 'Something went wrong. Please try again.',
                    color: '#ff8800',
                },
            ],
            components: [],
        });
        return;
    }

    buttonInfo.buttonIds.forEach((id) => {
        buttonInfos.delete(id);
    });

    const { message } = buttonInfo;
    interaction.update({});

    // Log obfuscations
    const logMessage = `${(buttonInfo.tag || 'Unknown User').replace(/\u001b\[\d+m/g, '')} -> ${buttonInfo.url} @ ${buttonInfo.preset}`;
    console.log(logMessage);
    await sendLogToChannel(logMessage);

    // Update Message
    await message.edit({
        embeds: [
            {
                title: 'Obfuscator V2000',
                description: `🔄 Uploading your file ...\n🔄 Obfuscating your file using ${buttonInfo?.preset} Preset ...\n🔄 Downloading your file ...`,
                color: '#ff8800',
            },
        ],
        components: [],
    });

    // Download file
    const tmpFile = tmp.fileSync({ postfix: '.lua' });

    const response = await Axios({
        method: 'GET',
        url: buttonInfo.url,
        responseType: 'stream',
    });

    if (response.headers['content-length'] && Number.parseInt(response.headers['content-length'], 10) > MAX_SIZE) {
        message.edit({
            embeds: [
                {
                    title: 'Obfuscator V2000',
                    description: 'The max filesize for the obfuscator bot is 40KB.',
                    color: '#ff0000',
                },
            ],
            components: [],
        });
        return;
    }

    response.data.pipe(fs.createWriteStream(tmpFile.name));

    // Wait for download to complete
    try {
        await new Promise<void>((resolve, reject) => {
            response.data.on('end', () => {
                resolve();
            });

            response.data.on('error', () => {
                reject();
            });
        });
    } catch (e) {
        message.edit({
            embeds: [
                {
                    title: 'Obfuscator V2000',
                    description: 'Upload failed! Please try again.',
                    color: '#ff0000',
                },
            ],
            components: [],
        });
        return;
    }

    // Update Message
    await message.edit({
        embeds: [
            {
                title: 'Obfuscator V2000',
                description: `✅ Uploading your file ...\n🔄 Obfuscating your file using ${buttonInfo?.preset} Preset ...\n🔄 Downloading your file ...`,
                color: '#ff8800',
            },
        ],
        components: [],
    });

    let outFile;
    try {
        outFile = await obfuscate(tmpFile.name, buttonInfo.preset);
    } catch (e) {
        message.edit({
            embeds: [
                {
                    title: 'Obfuscator V2000',
                    description: `Obfuscation failed:\n${e}`,
                    color: '#ff0000',
                },
            ],
            components: [],
        });
        return;
    }

    // Update Message
    await message.edit({
        embeds: [
            {
                title: 'Obfuscator V2000',
                description: `✅ Uploading your file ...\n✅ Obfuscating your file using ${buttonInfo?.preset} Preset ...\n🔄 Downloading your file ...`,
                color: '#ff8800',
            },
        ],
        components: [],
    });

    // Update Message
    const attachment = new MessageAttachment(outFile.name, 'obfuscated.lua');
    const fileMessage = await message.channel.send({
        files: [attachment],
    });
    const url = fileMessage.attachments.first()?.url;
    if (!url) {
        message.edit({
            embeds: [
                {
                    title: 'Obfuscator V2000',
                    description: 'Download failed! Please try again.',
                    color: '#ff0000',
                },
            ],
            components: [],
        });
        return;
    }
    fileMessage.delete();

    await message.edit({
        embeds: [
            {
                title: 'Obfuscator V2000',
                description: `✅ Uploading your file ...\n✅ Obfuscating your file using ${buttonInfo?.preset} Preset ...\n✅ Downloading your file ...\n\n🔗 [Download](${url})`,
                color: '#00ff00',
            },
        ],
        components: [],
    });

    // Delete Temp files
    outFile.removeCallback();
    tmpFile.removeCallback();
});

client.on('messageCreate', async (message) => {
    if (!message.author.bot) {
        // Handle file upload
        const file = message.attachments.first()?.url;
        if (!file) {
            message.reply('Please upload a file!');
            return;
        }

        const buttonIds = new Array(3).fill(0).map(() => uuid());

        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(buttonIds[0])
                    .setLabel('Weak')
                    .setStyle('SUCCESS'),
                new MessageButton()
                    .setCustomId(buttonIds[1])
                    .setLabel('Medium')
                    .setStyle('PRIMARY'),
                new MessageButton()
                    .setCustomId(buttonIds[2])
                    .setLabel('Strong')
                    .setStyle('DANGER'),
            );

        const content = 'For much more options, please use the standalone version.\n\nSelect the Preset to use:';

        const msg = await message.reply({
            embeds: [{
                title: 'Obfuscator V2000',
                color: '#ff8800',
                description: content,
            }],
            components: [row],
        });

        buttonInfos.set(buttonIds[0], {
            url: file,
            preset: 'Weak',
            tag: message.author.tag,
            message: msg,
            buttonIds,
        });
        buttonInfos.set(buttonIds[1], {
            url: file,
            preset: 'Medium',
            tag: message.author.tag,
            message: msg,
            buttonIds,
        });
        buttonInfos.set(buttonIds[2], {
            url: file,
            preset: 'Strong',
            tag: message.author.tag,
            message: msg,
            buttonIds,
        });

        // Log message for file upload
        const logMessage = `File uploaded by ${message.author.tag || 'Unknown User'}.`;
        console.log(logMessage);
        await sendLogToChannel(logMessage);
    }
});
