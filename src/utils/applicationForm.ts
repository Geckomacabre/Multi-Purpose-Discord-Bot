import { EmbedBuilder } from 'discord.js';

/**
 * The staff application questionnaire, written by the server owner (draft 2026-10-23).
 *
 * Discord modals hold at most five text inputs, so the form on the panel asks the basics
 * (role wanted, age/timezone/hours, time commitment, past staff roles and punishments, why).
 * Everything else is posted into the applicant's private application channel for them to
 * answer there: the rest of Part 1, the part(s) for the role they picked, and Part 5.
 * The staff-only reviewer guide is deliberately not posted anywhere the applicant can see.
 */

export type ApplicationRole = 'moderator' | 'admin' | 'developer';

export const APPLICATION_ROLE_NAMES: Record<ApplicationRole, string> = {
  moderator: 'Moderator',
  admin: 'Admin',
  developer: 'Developer Team',
};

/** Reads the free-text "which role" answer. Empty result = unsure, so every part is posted. */
export function parseApplicationRoles(text: string): ApplicationRole[] {
  const t = text.toLowerCase();
  const roles: ApplicationRole[] = [];
  if (/\bmod/.test(t)) roles.push('moderator');
  if (/\badmin/.test(t)) roles.push('admin');
  if (/\bdev/.test(t)) roles.push('developer');
  return roles;
}

type Section = { title: string; intro?: string; questions: string[] };

const PART1_REST: Section = {
  title: 'Part 1 – General questions (everyone)',
  intro: 'A few more things about you and how you spend time here.',
  questions: [
    'How long have you been in our community, and how active are you (chat, voice, events)?',
    'Do you play Squad? Roughly how many hours, and on which servers or in which roles (SL, pilot, crewman, etc.)?',
    'In your own words, what makes a good staff member and what makes a bad one?',
    'Is anything about your schedule or situation likely to limit your availability in the next few months?',
  ],
};

const PART2_MODERATOR: Section[] = [
  {
    title: 'Part 2 – Moderator: background',
    intro: 'Moderators need good judgment and a steady temper far more than technical skill, so most of these are scenarios.',
    questions: [
      'Which moderation tools have you used (timeouts, kicks, bans, AutoMod, ticket systems, logging bots)?',
      'Pick the server rule you think matters most and explain why.',
      'How do you tell the difference between heated banter and harassment?',
    ],
  },
  {
    title: 'Part 2 – Moderator: scenarios',
    intro: 'Answer in your own words; there is no single right answer.',
    questions: [
      'Someone is spamming general chat and no other staff are online. What do you do, step by step?',
      'Two regular members start arguing and it turns personal. How do you handle it?',
      'A close friend of yours breaks a rule. What do you do?',
      'A banned member DMs you, says the ban was unfair, and asks you to quietly undo it. What do you do?',
      'You think another moderator made the wrong call in public chat. What do you do?',
      'A member reports something said in voice chat, but you have no recording. How do you decide what to do?',
      'A raid of new accounts starts posting inappropriate content at 3 AM. Walk us through your first five minutes.',
      "You're unsure whether a message breaks the rules. Who do you ask, and what do you do in the meantime?",
    ],
  },
  {
    title: 'Part 2 – Moderator: self-awareness',
    questions: [
      'How do you deal with stress, abusive members, or burnout?',
      'Tell us about a time you made a mistake in a position of responsibility. What did you do afterwards?',
    ],
  },
];

const PART3_ADMIN: Section[] = [
  {
    title: 'Part 3 – Admin: experience',
    intro: 'Admins get full server commands and Discord admin roles, so these test technical knowledge of Discord and, even more, trustworthiness under pressure.',
    questions: [
      'Have you held admin, owner or senior-mod roles on any Discord server? Give the size, how long, and what you were responsible for.',
      'Describe a server you built or restructured: roles, categories, channels, and why you laid it out that way.',
      'Explain how role hierarchy and channel permission overrides interact. What happens when a role allows something and a channel override denies it?',
      'Which Discord permissions are risky to hand out (Administrator, Manage Roles, Manage Webhooks, Mention Everyone, etc.) and why?',
      'Which bots have you configured (Dyno, Carl-bot, MEE6, custom bots, etc.)? What did you set up: AutoMod, reaction roles, logging, tickets, welcome flows?',
      'Have you worked with the Discord Developer Portal, webhooks, or bot code? Which languages or libraries (discord.py, discord.js, etc.)?',
      'How would you set up logging so every moderator action can be audited?',
      'How would you onboard a new moderator, and how would you remove staff access when someone leaves or is removed?',
    ],
  },
  {
    title: 'Part 3 – Admin: crisis and judgment',
    questions: [
      'A moderator you trust is caught abusing permissions. Walk through exactly what you do.',
      'A staff account is compromised or a bot token leaks. What are your first ten minutes?',
      "How do you keep your own account and the server's admin access secure (2FA, role hygiene, bot permissions)?",
      'Staff are split on a ban appeal. How do you make the final decision?',
      'Two staff members are in a serious conflict. How do you handle it?',
      'How do you treat private information you see while moderating (DMs, reports, personal details)?',
    ],
  },
  {
    title: 'Part 3 – Admin: commitment',
    questions: [
      'Admin access means being reachable. How much time can you give, and how quickly can you usually respond to an urgent issue?',
      'Are you comfortable being held accountable for every action taken with your permissions? Why?',
    ],
  },
];

const PART4_DEVELOPER: Section[] = [
  {
    title: 'Part 4 – Developer Team: portfolio and experience',
    intro: "The Developer Team needs advanced, demonstrable skill with game and level tools, so these lean on your portfolio and specific technical know-how. Skip anything you haven't used and say so.",
    questions: [
      'Link your portfolio (ArtStation, Sketchfab, GitHub, itch.io, YouTube, shared drive). For each piece, say what you personally made and how long it took.',
      "Is all of it your own work? Note anything collaborative, from asset packs, or based on someone else's project.",
      'How long have you worked on games, levels or assets, and was it hobby, study or professional?',
    ],
  },
  {
    title: 'Part 4 – Developer Team: software skill check',
    intro: 'For each tool give your level (None / Beginner / Intermediate / Advanced), years of use, and something you have made with it.',
    questions: [
      'Blender',
      'Unreal Engine (list versions)',
      'Squad SDK editor',
      'Substance Painter / Designer',
      'ZBrush / Maya / 3ds Max',
      'Photoshop / GIMP',
      'Terrain tools (World Machine, Gaea, Houdini)',
      'Git / Perforce',
      'Blueprints / C++ / Python',
      'Other (audio, VFX, etc.)',
    ],
  },
  {
    title: 'Part 4 – Developer Team: technical questions',
    questions: [
      'Blender: walk through your pipeline from blockout to a game-ready asset (topology, UVs, poly budget, LODs, baking, export).',
      'Unreal Engine: describe a level you built end to end. What did you do for landscape, materials, lighting, and level streaming or World Partition?',
      "Squad SDK editor: what have you made or modified (maps, layers, game modes, vehicles, assets)? Have you packaged a project and tested it in-game? If not, what's the closest thing you've done?",
      'Level design: how would you lay out a large-scale combined-arms map (for example 50v50)? Cover objective flow, sight lines, cover, vehicle routes and scale.',
      'Optimization: a level runs badly. How do you find the cause and fix it?',
      'Materials and textures: describe your PBR workflow and how you manage texture memory.',
      'Collaboration: how do you use version control on a team, and how do you handle conflicts on binary assets?',
      'Scripting: describe anything you have scripted (Blueprints, C++, Python, Blender add-ons or tools).',
      'How do you take critique on your work, and how do you handle deadlines when scope grows?',
      'Are you willing to complete a short practical test (for example, blocking out a small area in the SDK editor)?',
    ],
  },
];

const PART5_CLOSING: Section = {
  title: 'Part 5 – Role preference and closing (everyone)',
  questions: [
    'If we think a different role fits you better, would you accept it?',
    'Do you hold staff or developer roles in other communities that might conflict with your time or loyalty here?',
    'Give two references (current staff or longtime members) who can speak to your character.',
    "Is there anything else we should know that wasn't covered above?",
  ],
};

const AGREEMENTS = [
  'I have read the server rules and will follow them as staff.',
  'I will keep private staff discussions, reports and member information confidential.',
  'I understand staff access can be changed or revoked at any time.',
  'I agree that staff may review my message history and past punishments as part of this application.',
  'Everything I wrote here is true and, where it says so, my own work.',
];

function sectionEmbed(section: Section, color: number): EmbedBuilder {
  const body = section.questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n');
  const desc = `${section.intro ? `*${section.intro}*\n\n` : ''}${body}`;
  return new EmbedBuilder().setColor(color).setTitle(section.title).setDescription(desc.slice(0, 4096));
}

/**
 * The questionnaire to post in the application channel after the form.
 * `roles` empty = the applicant is unsure, so every role part is included.
 */
export function buildQuestionnaireEmbeds(roles: ApplicationRole[]): EmbedBuilder[] {
  const chosen = roles.length ? roles : (['moderator', 'admin', 'developer'] as ApplicationRole[]);
  const embeds: EmbedBuilder[] = [];

  const roleList = chosen.map(r => APPLICATION_ROLE_NAMES[r]).join(', ');
  embeds.push(new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📝 Your application questions')
    .setDescription(
      `Thanks for the form. The rest of the application is below. Answer in this channel, in your own time, ` +
      `one message per part or all at once; just number your answers to match.\n\n` +
      `**Parts to answer:** General, ${roleList}, Closing.` +
      (roles.length ? '' : `\n*You weren't sure which role, so all three role parts are here. Answer the ones you want and staff will place you from your answers.*`) +
      `\n\nBe honest. "I haven't used that yet" is a fine answer and helps us place you in the right spot.`
    ));

  embeds.push(sectionEmbed(PART1_REST, 0x57F287));
  if (chosen.includes('moderator')) for (const s of PART2_MODERATOR) embeds.push(sectionEmbed(s, 0xFEE75C));
  if (chosen.includes('admin')) for (const s of PART3_ADMIN) embeds.push(sectionEmbed(s, 0xEB459E));
  if (chosen.includes('developer')) for (const s of PART4_DEVELOPER) embeds.push(sectionEmbed(s, 0xED4245));
  embeds.push(sectionEmbed(PART5_CLOSING, 0x57F287));
  embeds.push(new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Agreements')
    .setDescription(
      `Please confirm each of these in your reply (a simple "I agree to all five" is fine):\n\n` +
      AGREEMENTS.map(a => `☐ ${a}`).join('\n')
    ));
  return embeds;
}
