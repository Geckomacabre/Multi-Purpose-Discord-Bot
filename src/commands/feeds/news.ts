import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MessageFlags,
  PermissionFlagsBits, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { setNewsConfig, removeNewsConfig, getNewsConfigs } from '../../utils/db';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const CATEGORIES = [
  { name: '🌍 World News',    value: 'world' },
  { name: '🎬 TV & Movies',   value: 'entertainment' },
  { name: '⚽ Sports',        value: 'sports' },
  { name: '🏛️ Politics',     value: 'politics' },
  { name: '🎮 Gaming',        value: 'gaming' },
];

const NewsCmd: Command = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('Manage automated news feed channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s
      .setName('setup')
      .setDescription('Send a news category to a channel (hourly)')
      .addStringOption(o => o.setName('category').setDescription('News category').setRequired(true)
        .addChoices(...CATEGORIES))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post news in').setRequired(true)))
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Stop posting a news category')
      .addStringOption(o => o.setName('category').setDescription('Category to remove').setRequired(true)
        .addChoices(...CATEGORIES)))
    .addSubcommand(s => s
      .setName('list')
      .setDescription('Show all configured news feeds')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'setup') {
      const category = interaction.options.getString('category', true);
      const channel = interaction.options.getChannel('channel', true);
      await setNewsConfig(guildId, category, channel.id);
      const label = CATEGORIES.find(c => c.value === category)?.name ?? category;
      await interaction.editReply(cv2Text(
        `✅ **${label}** news will be posted to <#${channel.id}> every hour.`
      ));

    } else if (sub === 'remove') {
      const category = interaction.options.getString('category', true);
      const ok = await removeNewsConfig(guildId, category);
      const label = CATEGORIES.find(c => c.value === category)?.name ?? category;
      await interaction.editReply(cv2Text(
        ok ? `✅ Stopped posting **${label}** news.` : `❌ **${label}** was not configured.`
      ));

    } else {
      const configs = await getNewsConfigs(guildId);
      if (!configs.length) {
        await interaction.editReply(cv2Text('No news feeds configured. Use `/news setup` to add one.'));
        return;
      }
      const lines = configs.map(c => {
        const label = CATEGORIES.find(x => x.value === c.category)?.name ?? c.category;
        return `${label} → <#${c.channel_id}>`;
      });
      const container = new ContainerBuilder()
        .setAccentColor(Colors.Blue)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**News Feeds**\n\n${lines.join('\n')}`
        ));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
    }
  },
};

export default NewsCmd;
