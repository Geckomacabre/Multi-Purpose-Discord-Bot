import { ApplicationPosition } from "./types";

export const Channels = {
  Honeypot: "1489130661037084683",
  Rules: "1477439101941584036",
  Applications: "1495297972408291438",
  Info: "1477434466392735838",
  General: "1495591083080548534",
  Voice: "1496346696471416912",
  Verification: "1505342327697313863"
} as const;

export const Roles = {
  EXCLUSIVE: "1496264991266050290",
  BirthdayOperative: "1492365413873619095",
  ACCESS: "1496263685151391865",
  ClubMember: "1490332253627089007",
  LoungeGuest: "1505343240596099122",
  Newcomer: "1478173271253061633",
  ALERTS: "1496265313614823445",
  BirthdayPings: "1492368009673834496"
} as const;

export type LinkedRoleRule = {
  parent: string;
  children: string[];
  mode?: "ANY" | "ALL" | "MIN_COUNT";
  minCount?: number;
};

export const LinkedRoles: LinkedRoleRule[] = [
  {
    parent: Roles.EXCLUSIVE,
    children: [
      "1484354251382587466", // Midnight VIP
      "1492365413873619095", // Birthday Operative
    ],
  },
  {
    parent: Roles.ACCESS,
    children: [
      "1478173271253061633", // Newcomer
      "1505343240596099122", // Lounge Guest
      "1490332253627089007", // Club Member
    ],
  },
  {
    parent: Roles.ALERTS,
    children: [
      "1494543592969080924", // Free Game Alerts
      "1494543671897362432", // Sales Tracker Alerts
      "1495321338867617904", // Community Alerts
      "1496964362391257178", // Activity Pings
      "1492368009673834496", // Birthday Pings
    ],
  },
];

export const Positions: ApplicationPosition[] = [
  {
    custom_id: "apply_operative",
    label: "Operative",
    role_id: "1477434457450352762",
    open: false,
    description:
      "Trial moderation role. Assists with basic moderation tasks, responds to reports, and learns the systems before becoming a full Operative.",
    questions: [
      {
        custom_id: "q_club_member",
        label: "Are you a Club Member?",
        type: "checkbox",
        options: [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ],
      },
    ],
  },
  {
    custom_id: "apply_application-reviewer",
    label: "Application Reviewer",
    role_id: "1495313765699289289",
    open: false,
    description:
      "Reviews incoming applications, filters low-effort submissions, and forwards strong candidates to higher staff. Focused strictly on evaluation.",
    questions: [
      {
        custom_id: "q_about_you",
        label: "Tell us about yourself",
        type: "paragraph",
        placeholder: "Describe your experience and why you want this position.",
        required: true,
      },
    ],
  },
  {
    custom_id: "apply_lounge-host",
    label: "Lounge Host",
    role_id: "1477434764523995329",
    open: false,
    description:
      "Hosts events, keeps conversations flowing, and maintains the Lounge atmosphere. A social role focused on community engagement, not moderation.",
    questions: [
      {
        custom_id: "q_about_you",
        label: "Tell us about your hosting style",
        type: "paragraph",
        placeholder: "Explain how you would keep the Lounge engaging and welcoming.",
        required: true,
      },
    ],
  },
  {
    custom_id: "apply_club-member",
    label: "Club Member",
    role_id: "1505343240596099122",
    open: true,
    description:
      "A verified role granted by staff, signifying your acceptance into the Club's main circle and unlocking full access.",
    questions: [
      {
        custom_id: "q_age_verification",
        label: "Age Requirement",
        type: "checkbox",
        description: "I confirm that I am at least 18 years of age.",
      },
      {
        custom_id: "q_content_acknowledgement",
        label: "Content Maturity",
        type: "checkbox",
        description:
          "I understand this area contains adult (NSFW) or crude content and I wish to proceed.",
      },
      {
        custom_id: "q_rules_confidentiality",
        label: "Conduct & Confidentiality",
        type: "checkbox",
        description:
          "I agree to follow all Club rules and keep all internal discussions strictly confidential.",
      },
      {
        custom_id: "q_introduction",
        label: "Introduction",
        type: "short",
        description: "Briefly, why do you want to join the inner circle?",
        required: true,
      },
      {
        custom_id: "q_additional_info",
        label: "Additional Comments",
        type: "short",
        description: "Is there anything else the staff should know?",
        required: false,
      },
    ],
  },
];