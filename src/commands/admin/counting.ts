import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  ComponentType,
  InteractionContextType,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
  TextInputStyle,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Counting: Command = {
  data: new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Configure this current channel as a counting channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),
  async run(interaction: ChatInputCommandInteraction) {
    if (!interaction.channel) return;
    const count = await db.getCounting(interaction.channel.id);

    const modal = new ModalBuilder()
      .setTitle('Counting')
      .setCustomId(`counting_modal:${interaction.channel.id}`)
      .addTextDisplayComponents(
        new TextDisplayBuilder({
          content:
            `Configure the counting channel <#${interaction.channel.id}>:\n` +
            (count
              ? `-# The current count is **${count?.count.toLocaleString()}** with a high score of **${count?.highscore?.toLocaleString() || count?.count.toLocaleString()}**.`
              : `-# This channel is not a counting channel yet. Use the form below to set it up!`),
        })
      )
      .addLabelComponents(
        new LabelBuilder({
          label: 'Current Count',
          description: 'Set the current count for this counting channel',
          component: {
            type: ComponentType.TextInput,
            custom_id: 'current_count',
            max_length: 10,
            min_length: 1,
            style: TextInputStyle.Short,
            required: !!count,
            value: count ? count.count?.toLocaleString() || '0' : undefined,
            placeholder: count?.count?.toLocaleString() || '0',
          },
        }),
        new LabelBuilder({
          label: 'High Score',
          description: 'Set the high score for this counting channel',
          component: {
            type: ComponentType.TextInput,
            custom_id: 'high_score',
            max_length: 10,
            min_length: 1,
            style: TextInputStyle.Short,
            required: false,
            value: count?.highscore?.toLocaleString() || undefined,
            placeholder: count?.highscore?.toLocaleString() || '0',
          },
        }),
        ...(count
          ? [
              new LabelBuilder({
                label: 'Disable Counting',
                description: 'If enabled, the bot will stop counting and reset the data.',
                component: {
                  type: ComponentType.Checkbox,
                  custom_id: 'reset_messages',
                  default: false,
                },
              }),
            ]
          : [])
      );

    await interaction.showModal(modal);
  },
};

export default Counting;
