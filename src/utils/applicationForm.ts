import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';

/**
 * The staff application questionnaire, written by the server owner (draft 2026-10-23).
 *
 * The whole thing is answered BEFORE anything is created: Discord modals hold at most five
 * text inputs, so the questionnaire is split into pages of up to five questions. Between
 * pages the applicant gets an ephemeral message that shows the next questions in full and a
 * button that opens the form for them (a modal can't open another modal directly). Only the
 * last page creates the private application channel and sends the DMs.
 *
 * Page 0 is the same for everyone and asks which role; the pages after it depend on the
 * role(s) picked: the rest of Part 1, Part 2 (Moderator), Part 3 (Admin), Part 4 (Developer
 * Team), then Part 5 and the agreements. "Not sure" gets all three role parts.
 * The staff-only reviewer guide is deliberately not in here.
 */

export type ApplicationRole = 'moderator' | 'admin' | 'developer';

export const APPLY_CANCEL_ID = 'ticket:apply-cancel';

export const APPLICATION_ROLE_NAMES: Record<ApplicationRole, string> = {
  moderator: 'Moderator',
  admin: 'Admin',
  developer: 'Developer Team',
};

export const APPLY_ROLE_PREFIX = 'ticket:apply-role:';

/** What each role is, from the owner's form; shown on the role picker. */
const ROLE_BLURBS: Record<ApplicationRole | 'unsure', { scope: string; lookFor: string }> = {
  moderator: { scope: 'Bare-minimum staff permissions', lookFor: 'Fairness, patience, steady presence, good judgment under pressure' },
  admin: { scope: 'Full server commands and Discord admin roles for the servers', lookFor: 'Proven trustworthiness, strong Discord/server knowledge, calm in a crisis' },
  developer: { scope: 'Game and level development work', lookFor: 'Advanced skills in Blender, Unreal Engine, the Squad SDK editor and related tools' },
  unsure: { scope: 'You answer every role\'s questions', lookFor: 'Staff place you from your answers' },
};

/** Text for a role choice: [] = not sure (every role part is asked). */
export function describeRoles(roles: ApplicationRole[]): string {
  return roles.length ? roles.map(r => APPLICATION_ROLE_NAMES[r]).join(' / ') : 'Not sure, place me (all three role parts)';
}

/** The first thing the applicant sees: pick the role, which decides the pages that follow. */
export function buildRolePicker() {
  const rows = (Object.keys(ROLE_BLURBS) as (ApplicationRole | 'unsure')[]).map(k => {
    const name = k === 'unsure' ? 'Not sure, place me' : APPLICATION_ROLE_NAMES[k];
    return `**${name}** — ${ROLE_BLURBS[k].scope}\n*What we look for:* ${ROLE_BLURBS[k].lookFor}`;
  }).join('\n\n');
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Staff Application — which role?')
    .setDescription(
      `Everyone answers the general questions and a short closing page. The middle of the form is only the questions for the role you pick ` +
      `(Moderator, Admin or Developer Team). Pick **Not sure** and you answer all three.\n\n${rows}\n\n` +
      `Be honest. "I haven't used that yet" is a fine answer and helps us place you in the right spot. Nothing is sent to staff until the last page.`
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${APPLY_ROLE_PREFIX}moderator`).setLabel('Moderator').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId(`${APPLY_ROLE_PREFIX}admin`).setLabel('Admin').setStyle(ButtonStyle.Primary).setEmoji('⚙️'),
    new ButtonBuilder().setCustomId(`${APPLY_ROLE_PREFIX}developer`).setLabel('Developer Team').setStyle(ButtonStyle.Primary).setEmoji('🧱'),
    new ButtonBuilder().setCustomId(`${APPLY_ROLE_PREFIX}unsure`).setLabel('Not sure, place me').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(APPLY_CANCEL_ID).setLabel('Cancel').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

/** Reads a role button's custom id: [] = not sure. null = not a role button. */
export function parseRoleButton(customId: string): ApplicationRole[] | null {
  if (!customId.startsWith(APPLY_ROLE_PREFIX)) return null;
  const key = customId.slice(APPLY_ROLE_PREFIX.length);
  if (key === 'unsure') return [];
  return key in APPLICATION_ROLE_NAMES ? [key as ApplicationRole] : null;
}

export type ApplicationQuestion = {
  id: string;
  /** Modal label, max 45 characters. */
  label: string;
  /** The owner's full question, shown in the page prompt and kept in the answers. */
  text: string;
  style?: TextInputStyle; // default Paragraph
  max?: number;           // default 1000 (an embed field holds 1024)
  required?: boolean;     // default true
  placeholder?: string;
};

export type ApplicationPage = {
  /** Which part this page belongs to, e.g. "Part 2 – Moderator". */
  part: string;
  /** Short note shown above the questions, from the owner's form. */
  intro?: string;
  questions: ApplicationQuestion[]; // 1–5
};

const S = TextInputStyle.Short;

// ─── Page 0: who you are (everyone) ──────────────────────────────────────────

export const FIRST_PAGE: ApplicationPage = {
  part: 'Part 1 – General questions (everyone)',
  intro: 'Everyone answers Part 1 and Part 5, then the part for the role you want. "I haven\'t used that yet" is a fine answer and helps us place you.',
  questions: [
    { id: 'age', label: 'Age', text: 'Age.', style: S, max: 10 },
    { id: 'tz', label: 'Time zone, usual online days and hours', text: "Time zone, and the days and hours you're usually online.", style: S, max: 120 },
    { id: 'hours', label: 'Hours per week for staff duties', text: 'How many hours per week can you realistically give to staff duties?', style: S, max: 60 },
    { id: 'tenure', label: 'How long here, and how active (chat/voice)', text: 'How long have you been in our community, and how active are you (chat, voice, events)?', max: 500 },
  ],
};

// ─── Rest of Part 1 (everyone) ───────────────────────────────────────────────

const PART1_REST: ApplicationPage[] = [{
  part: 'Part 1 – General questions (everyone)',
  questions: [
    { id: 'squad', label: 'Do you play Squad? Hours, servers, roles', text: 'Do you play Squad? Roughly how many hours, and on which servers or in which roles (SL, pilot, crewman, etc.)?', max: 500 },
    { id: 'past_staff', label: 'Past staff roles: where, how long, why left', text: 'Have you held a staff role anywhere else (Discord, game servers, clans)? List the role, how long, and why you left.', placeholder: '"None" is fine.' },
    { id: 'punishments', label: 'Ever warned, muted, kicked or banned?', text: 'Have you ever been warned, muted, kicked or banned from any Discord or game server? What happened?', placeholder: '"No" is fine. Be honest; we can check.' },
    { id: 'why', label: 'Why do you want to be on staff here?', text: 'Why do you want to be on staff here?' },
    { id: 'good_bad', label: 'What makes a good / bad staff member?', text: 'In your own words, what makes a good staff member and what makes a bad one?' },
  ],
}, {
  part: 'Part 1 – General questions (everyone)',
  questions: [
    { id: 'limits', label: 'Anything likely to limit your availability?', text: 'Is anything about your schedule or situation likely to limit your availability in the next few months?', max: 500 },
  ],
}];

// ─── Part 2: Moderator ───────────────────────────────────────────────────────

const PART2_MODERATOR: ApplicationPage[] = [{
  part: 'Part 2 – Moderator questions',
  intro: 'Moderators need good judgment and a steady temper far more than technical skill, so these are mostly scenarios. Answer in your own words; there is no single right answer.',
  questions: [
    { id: 'm_tools', label: 'Moderation tools you have used', text: 'Which moderation tools have you used (timeouts, kicks, bans, AutoMod, ticket systems, logging bots)?' },
    { id: 'm_rule', label: 'The server rule that matters most, and why', text: 'Pick the server rule you think matters most and explain why.' },
    { id: 'm_banter', label: 'Heated banter vs harassment: the difference', text: 'How do you tell the difference between heated banter and harassment?' },
    { id: 'm_spam', label: 'Spammer in general, no other staff online', text: 'Someone is spamming general chat and no other staff are online. What do you do, step by step?' },
    { id: 'm_argument', label: 'Two regulars argue and it turns personal', text: 'Two regular members start arguing and it turns personal. How do you handle it?' },
  ],
}, {
  part: 'Part 2 – Moderator questions',
  questions: [
    { id: 'm_friend', label: 'A close friend of yours breaks a rule', text: 'A close friend of yours breaks a rule. What do you do?' },
    { id: 'm_dm_unban', label: 'Banned member DMs you to quietly undo it', text: 'A banned member DMs you, says the ban was unfair, and asks you to quietly undo it. What do you do?' },
    { id: 'm_wrong_call', label: 'Another mod made a wrong call in public', text: 'You think another moderator made the wrong call in public chat. What do you do?' },
    { id: 'm_voice', label: 'Voice chat report with no recording', text: 'A member reports something said in voice chat, but you have no recording. How do you decide what to do?' },
    { id: 'm_raid', label: 'A 3 AM raid: your first five minutes', text: 'A raid of new accounts starts posting inappropriate content at 3 AM. Walk us through your first five minutes.' },
  ],
}, {
  part: 'Part 2 – Moderator questions',
  questions: [
    { id: 'm_unsure', label: 'Unsure if a message breaks the rules', text: "You're unsure whether a message breaks the rules. Who do you ask, and what do you do in the meantime?" },
    { id: 'm_stress', label: 'Stress, abusive members, burnout', text: 'How do you deal with stress, abusive members, or burnout?' },
    { id: 'm_mistake', label: 'A mistake you made in a responsible role', text: 'Tell us about a time you made a mistake in a position of responsibility. What did you do afterwards?' },
  ],
}];

// ─── Part 3: Admin ───────────────────────────────────────────────────────────

const PART3_ADMIN: ApplicationPage[] = [{
  part: 'Part 3 – Admin questions',
  intro: 'Admins get full server commands and Discord admin roles, so these test technical knowledge of Discord and, even more, trustworthiness under pressure.',
  questions: [
    { id: 'a_roles_held', label: 'Admin/owner/senior-mod roles: size, duration', text: 'Have you held admin, owner or senior-mod roles on any Discord server? Give the size, how long, and what you were responsible for.' },
    { id: 'a_built', label: 'A server you built or restructured, and why', text: 'Describe a server you built or restructured: roles, categories, channels, and why you laid it out that way.' },
    { id: 'a_hierarchy', label: 'Role hierarchy vs channel overrides', text: 'Explain how role hierarchy and channel permission overrides interact. What happens when a role allows something and a channel override denies it?' },
    { id: 'a_risky_perms', label: 'Risky Discord permissions, and why', text: 'Which Discord permissions are risky to hand out (Administrator, Manage Roles, Manage Webhooks, Mention Everyone, etc.) and why?' },
  ],
}, {
  part: 'Part 3 – Admin questions',
  questions: [
    { id: 'a_bots', label: 'Bots you have configured, and what you set up', text: 'Which bots have you configured (Dyno, Carl-bot, MEE6, custom bots, etc.)? What did you set up: AutoMod, reaction roles, logging, tickets, welcome flows?' },
    { id: 'a_devportal', label: 'Developer Portal, webhooks, bot code?', text: 'Have you worked with the Discord Developer Portal, webhooks, or bot code? Which languages or libraries (discord.py, discord.js, etc.)?' },
    { id: 'a_logging', label: 'Logging so every mod action can be audited', text: 'How would you set up logging so every moderator action can be audited?' },
    { id: 'a_onboard', label: 'Onboarding a new mod; removing staff access', text: 'How would you onboard a new moderator, and how would you remove staff access when someone leaves or is removed?' },
  ],
}, {
  part: 'Part 3 – Admin questions',
  intro: 'Crisis and judgment.',
  questions: [
    { id: 'a_abuse', label: 'A trusted mod is caught abusing permissions', text: 'A moderator you trust is caught abusing permissions. Walk through exactly what you do.' },
    { id: 'a_compromise', label: 'Staff account compromised or token leaked', text: 'A staff account is compromised or a bot token leaks. What are your first ten minutes?' },
    { id: 'a_security', label: 'Keeping your account and admin access secure', text: "How do you keep your own account and the server's admin access secure (2FA, role hygiene, bot permissions)?" },
    { id: 'a_appeal', label: 'Staff split on a ban appeal: final decision', text: 'Staff are split on a ban appeal. How do you make the final decision?' },
  ],
}, {
  part: 'Part 3 – Admin questions',
  intro: 'Judgment and commitment.',
  questions: [
    { id: 'a_conflict', label: 'Two staff members in a serious conflict', text: 'Two staff members are in a serious conflict. How do you handle it?' },
    { id: 'a_private', label: 'Private info you see while moderating', text: 'How do you treat private information you see while moderating (DMs, reports, personal details)?' },
    { id: 'a_reachable', label: 'Time you can give; response time when urgent', text: 'Admin access means being reachable. How much time can you give, and how quickly can you usually respond to an urgent issue?', max: 500 },
    { id: 'a_accountable', label: 'Accountable for every action with your perms?', text: 'Are you comfortable being held accountable for every action taken with your permissions? Why?', max: 500 },
  ],
}];

// ─── Part 4: Developer Team ──────────────────────────────────────────────────

const PART4_DEVELOPER: ApplicationPage[] = [{
  part: 'Part 4 – Developer Team questions',
  intro: "The Developer Team needs advanced, demonstrable skill with game and level tools, so these lean on your portfolio and specific technical know-how. Skip anything you haven't used and say so.",
  questions: [
    { id: 'd_portfolio', label: 'Portfolio links; what you made, how long', text: 'Link your portfolio (ArtStation, Sketchfab, GitHub, itch.io, YouTube, shared drive). For each piece, say what you personally made and how long it took.' },
    { id: 'd_own_work', label: 'All your own work? Note collaborations/packs', text: "Is all of it your own work? Note anything collaborative, from asset packs, or based on someone else's project.", max: 500 },
    { id: 'd_years', label: 'Years in games/levels/assets; hobby or pro?', text: 'How long have you worked on games, levels or assets, and was it hobby, study or professional?', max: 300 },
    { id: 'd_skills', label: 'Skill check: level, years, example per tool', text: 'Software skill check. For each tool give your level (None / Beginner / Intermediate / Advanced), years, and something you have made with it: Blender; Unreal Engine (list versions); Squad SDK editor; Substance Painter / Designer; ZBrush / Maya / 3ds Max; Photoshop / GIMP; Terrain tools (World Machine, Gaea, Houdini); Git / Perforce; Blueprints / C++ / Python; Other (audio, VFX, etc.).', placeholder: 'Blender: Advanced, 4 yrs, props for ... | Unreal 5.3: Intermediate, 2 yrs, ... | Squad SDK: None' },
  ],
}, {
  part: 'Part 4 – Developer Team questions',
  intro: 'Technical questions.',
  questions: [
    { id: 'd_blender', label: 'Blender: blockout to game-ready pipeline', text: 'Blender: walk through your pipeline from blockout to a game-ready asset (topology, UVs, poly budget, LODs, baking, export).' },
    { id: 'd_unreal', label: 'Unreal: a level you built end to end', text: 'Unreal Engine: describe a level you built end to end. What did you do for landscape, materials, lighting, and level streaming or World Partition?' },
    { id: 'd_sdk', label: 'Squad SDK: what you made; tested in-game?', text: "Squad SDK editor: what have you made or modified (maps, layers, game modes, vehicles, assets)? Have you packaged a project and tested it in-game? If not, what's the closest thing you've done?" },
    { id: 'd_level_design', label: 'Laying out a 50v50 combined-arms map', text: 'Level design: how would you lay out a large-scale combined-arms map (for example 50v50)? Cover objective flow, sight lines, cover, vehicle routes and scale.' },
    { id: 'd_optimize', label: 'A level runs badly: find and fix the cause', text: 'Optimization: a level runs badly. How do you find the cause and fix it?' },
  ],
}, {
  part: 'Part 4 – Developer Team questions',
  questions: [
    { id: 'd_pbr', label: 'PBR workflow and texture memory', text: 'Materials and textures: describe your PBR workflow and how you manage texture memory.' },
    { id: 'd_vcs', label: 'Version control on a team; binary conflicts', text: 'Collaboration: how do you use version control on a team, and how do you handle conflicts on binary assets?' },
    { id: 'd_scripting', label: 'Anything you have scripted', text: 'Scripting: describe anything you have scripted (Blueprints, C++, Python, Blender add-ons or tools).' },
    { id: 'd_critique', label: 'Taking critique; deadlines when scope grows', text: 'How do you take critique on your work, and how do you handle deadlines when scope grows?', max: 500 },
    { id: 'd_test', label: 'Willing to do a short practical test?', text: 'Are you willing to complete a short practical test (for example, blocking out a small area in the SDK editor)?', style: S, max: 100 },
  ],
}];

// ─── Part 5: closing (everyone) ──────────────────────────────────────────────

export const AGREEMENTS = [
  'I have read the server rules and will follow them as staff.',
  'I will keep private staff discussions, reports and member information confidential.',
  'I understand staff access can be changed or revoked at any time.',
  'I agree that staff may review my message history and past punishments as part of this application.',
  'Everything I wrote here is true and, where it says so, my own work.',
];

const PART5_CLOSING: ApplicationPage[] = [{
  part: 'Part 5 – Role preference and closing (everyone)',
  intro: `Last page. The agreements you are confirming:\n${AGREEMENTS.map(a => `• ${a}`).join('\n')}`,
  questions: [
    { id: 'other_role', label: 'Accept a different role if we suggest it?', text: 'If we think a different role fits you better, would you accept it?', style: S, max: 100 },
    { id: 'conflicts', label: 'Staff/dev roles elsewhere that may conflict?', text: 'Do you hold staff or developer roles in other communities that might conflict with your time or loyalty here?', max: 500 },
    { id: 'references', label: 'Two references (staff or longtime members)', text: 'Give two references (current staff or longtime members) who can speak to your character.', max: 300 },
    { id: 'anything_else', label: 'Anything else we should know? (optional)', text: "Is there anything else we should know that wasn't covered above?", required: false },
    { id: 'agree', label: 'Type "I agree" to confirm all five agreements', text: 'Agreements: I have read the server rules and will follow them as staff; I will keep private staff discussions, reports and member information confidential; I understand staff access can be changed or revoked at any time; I agree that staff may review my message history and past punishments; everything I wrote here is true and, where it says so, my own work.', style: S, max: 40, placeholder: 'I agree' },
  ],
}];

// ─── Page assembly ───────────────────────────────────────────────────────────

/** All pages after page 0 for the role(s) picked (empty = unsure = every role part). */
export function buildApplicationPages(roles: ApplicationRole[]): ApplicationPage[] {
  const chosen = roles.length ? roles : (['moderator', 'admin', 'developer'] as ApplicationRole[]);
  const pages: ApplicationPage[] = [FIRST_PAGE, ...PART1_REST];
  if (chosen.includes('moderator')) pages.push(...PART2_MODERATOR);
  if (chosen.includes('admin')) pages.push(...PART3_ADMIN);
  if (chosen.includes('developer')) pages.push(...PART4_DEVELOPER);
  pages.push(...PART5_CLOSING);
  return pages;
}

export const APPLY_MODAL_PREFIX = 'ticket:apply-modal:';
export const APPLY_PAGE_PREFIX = 'ticket:apply-page:';
export const APPLY_RESTART_ID = 'ticket:apply-restart';

/** The five-field form for one page. */
export function buildPageModal(page: ApplicationPage, index: number, total: number): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${APPLY_MODAL_PREFIX}${index}`)
    .setTitle(total > 0 ? `Staff Application (${index + 1}/${total})` : 'Staff Application');
  for (const q of page.questions) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.style ?? TextInputStyle.Paragraph)
      .setMaxLength(q.max ?? 1000)
      .setRequired(q.required ?? true);
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

/**
 * The ephemeral prompt shown between pages: the next page's questions in full, and a
 * button that opens its form. `total` may grow after page 0 once the role is known.
 */
export function buildPagePrompt(page: ApplicationPage, index: number, total: number, roles: ApplicationRole[]) {
  const roleText = describeRoles(roles);
  const qs = page.questions.map((q, i) => `**${i + 1}.** ${q.text}${q.required === false ? ' *(optional)*' : ''}`).join('\n\n');
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📋 Staff Application — page ${index + 1} of ${total}`)
    .setDescription(
      `**Applying for:** ${roleText}\n**${page.part}**\n` +
      (page.intro ? `*${page.intro}*\n\n` : '\n') +
      `Read the questions, then press **Answer page ${index + 1}** to open the form. ` +
      `Nothing is sent to staff until the last page.\n\n${qs}`
    ).setFooter({ text: 'Your answers so far are saved; you can come back to this later via the Apply for Staff button.' });
  if ((embed.data.description?.length ?? 0) > 4096) embed.setDescription(embed.data.description!.slice(0, 4093) + '...');
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${APPLY_PAGE_PREFIX}${index}`).setLabel(`Answer page ${index + 1}`).setStyle(ButtonStyle.Primary).setEmoji('✍️'),
    new ButtonBuilder().setCustomId(APPLY_RESTART_ID).setLabel('Start over').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(APPLY_CANCEL_ID).setLabel('Cancel application').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

/**
 * The applicant's answers posted in the application channel: one embed per page, so no
 * message passes Discord's 6,000-character embed budget (5 fields × 1,024 max).
 */
export function buildAnswerEmbeds(pages: ApplicationPage[], answers: Record<string, string>, color = 0x5865F2): EmbedBuilder[] {
  return pages.map((page, i) => new EmbedBuilder()
    .setColor(color)
    .setTitle(`${page.part} — page ${i + 1} of ${pages.length}`)
    .addFields(page.questions.map(q => ({
      name: q.text.slice(0, 256),
      value: (answers[q.id]?.trim() || '*(no answer)*').slice(0, 1024),
    }))));
}
