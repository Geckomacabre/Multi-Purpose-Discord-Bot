export const Channels = {} as const;

export const Roles = {
  MidnightSystems: '1477434976172511272',
  EXCLUSIVE: '1496264991266050290',
  ACCESS: '1496263685151391865',
  Newcomer: '1478173271253061633',
  ALERTS: '1496265313614823445',
} as const;

export type LinkedRoleRule = {
  parent: string;
  children: string[];
  mode?: 'ANY' | 'ALL' | 'MIN_COUNT';
  minCount?: number;
};

// Parent roles that are automatically assigned when a member has any child role
export const LinkedRoles: LinkedRoleRule[] = [
  {
    parent: Roles.EXCLUSIVE,
    children: [
      '1484354251382587466', // Midnight VIP
      '1492365413873619095', // Birthday Operative
    ],
  },
  {
    parent: Roles.ACCESS,
    children: [
      '1490332253627089007', // Club Member
      '1505343240596099122', // Lounge Guest
      '1478173271253061633', // Newcomer
    ],
  },
  {
    parent: Roles.ALERTS,
    children: [
      '1494543592969080924', // Free Game Alerts
      '1494543671897362432', // Sales Tracker Alerts
      '1495321338867617904', // Community Alerts
      '1492368009673834496', // Birthday Pings
    ],
  },
];
