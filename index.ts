import {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  ActionRow,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  VoiceChannel,
} from "discord.js";
import { CronJob } from "cron";
import { readFileSync, writeFileSync } from "fs";
import "dotenv/config";

const client = new Client({
  intents: [
    "Guilds",
    "GuildMembers",
    "GuildVoiceStates",
    "GuildMessages",
    "MessageContent",
  ],
});

const resource = createAudioResource("./bigben.mp3", {
  inlineVolume: true,
});

type Setting = {
  mode: "max" | "off" | "specific";
  specificChannelId?: string;
};

let enabledGuilds: Record<string, Setting> = {
  "1271138054794379406": {
    mode: "max",
  },
};

client.on("ready", async () => {
  console.log("Bot is ready");

  const guildJson = JSON.parse(readFileSync("guilds.json", "utf-8"));

  enabledGuilds = guildJson;

  // run each hour
  new CronJob("0 0 * * * *", playTheBen).start();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guildId === null) return;

  // not using any cmd
  if (!message.content.startsWith("!")) return;
  if (!message.member) return;
  if (
    ![
      "!enable",
      "!disable",
      "!specific",
      "!status",
      "!list",
      "!test",
      "!invites",
      "!help",
      "!max",
    ].includes(message.content)
  )
    return;

  message.deletable && message.delete();

  // check permission

  if (!message.member?.permissions.has("Administrator")) {
    message.channel.send("You don't have permission");
    return;
  }

  if (message.content === "!help") {
    message.channel.send(`
    !enable - Enable the bot
    !disable - Disable the bot
    !specific - Enable the bot for specific channel
    !status - Get the current status
    !list - Get the list of all guilds
    !test - Test the bot
    !invites - Get the invite link
    !max - Enable the bot for maximum connected channel
    `);
  }

  if (message.content === "!max") {
    enabledGuilds[message.guildId] = {
      mode: "max",
    };
    message.channel.send("Enabled");
    writeFileSync("guilds.json", JSON.stringify(enabledGuilds));
  }

  if (message.content === "!enable") {
    enabledGuilds[message.guildId] = {
      mode: "max",
    };
    message.channel.send("Enabled");
    writeFileSync("guilds.json", JSON.stringify(enabledGuilds));
  }

  if (message.content === "!disable") {
    delete enabledGuilds[message.guildId];
    message.channel.send("Disabled");
    writeFileSync("guilds.json", JSON.stringify(enabledGuilds));
  }

  if (message.content === "!specific") {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      message.channel.send("You are not in voice channel");
      return;
    }

    enabledGuilds[message.guildId] = {
      mode: "specific",
      specificChannelId: voiceChannel.id,
    };
    message.channel.send("Enabled");

    writeFileSync("guilds.json", JSON.stringify(enabledGuilds));
  }

  if (message.content === "!status") {
    message.channel.send(
      `Current setting: ${JSON.stringify(enabledGuilds[message.guildId])}`
    );
  }

  if (message.content === "!list") {
    message.channel.send(`Current setting: ${JSON.stringify(enabledGuilds)}`);
  }
  if (message.content === "!test") {
    if (!message.guildId) return;
    playTheBen(message.guildId);
  }

  if (message.content === "!invites") {
    const inviteButton = new ButtonBuilder()
      .setLabel("Invite")
      .setStyle(ButtonStyle.Link)
      .setURL(
        "https://discord.com/oauth2/authorize?client_id=1289266312656195684"
      );
    message.channel.send({
      content: "Invite the bot to your server",
      components: [
        //@ts-ignore
        new ActionRowBuilder().addComponents(inviteButton),
      ],
    });
  }
});

async function playTheBen(guildId?: string) {
  for (const guild of Object.keys(enabledGuilds).filter(
    (guild) =>
      enabledGuilds[guild].mode !== "off" && (!guildId || guild === guildId)
  )) {
    // fetch a channel which have maximum members connected
    let channel: VoiceChannel | null = null;

    const setting = enabledGuilds[guild];

    if (setting.mode === "max") {
      const channels = await client.guilds.cache.get(guild)?.channels.fetch();

      const voiceChannels = channels?.filter(
        (channel) => channel && channel.type === ChannelType.GuildVoice
      );

      console.log(voiceChannels?.map((channel) => channel?.name));

      channel = voiceChannels?.reduce((prev, current) => {
        if (current && prev && current.members.size > prev.members.size) {
          return current;
        }
        return prev;
      }, voiceChannels.first()) as VoiceChannel;
    } else if (setting.mode === "specific" && setting.specificChannelId) {
      channel = (await client.channels.fetch(
        setting.specificChannelId
      )) as VoiceChannel;
    } else {
      console.log("No channel found");
      return;
    }

    if (!channel) {
      console.log("No channel found");
      return;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });
    const player = createAudioPlayer();
    connection.subscribe(player);

    player.play(resource);

    // discount
    player.on("stateChange", (oldState, newState) => {
      if (newState.status === "idle") {
        connection.destroy();
      }
    });
  }
}

client.login(process.env.TOKEN);
