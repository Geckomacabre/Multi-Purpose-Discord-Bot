import { layout, escHtml, channelSelect } from '../layout';
import type { SessionUser } from '../session';
import type { APIGuild, APIChannel } from '../discord';
import * as db from '../../utils/db';

const LOG_FLAGS: Array<{ key: keyof db.ILogConfig; label: string }> = [
  { key: 'log_joins',           label: 'Member Joined' },
  { key: 'log_leaves',          label: 'Member Left' },
  { key: 'log_bans',            label: 'Member Banned/Unbanned' },
  { key: 'log_nickname_changes',label: 'Nickname Changed' },
  { key: 'log_role_changes',    label: 'Member Roles Changed' },
  { key: 'log_member_profile',  label: 'Username / Avatar Changed' },
  { key: 'log_message_edits',   label: 'Message Edited' },
  { key: 'log_message_deletes', label: 'Message Deleted' },
  { key: 'log_emoji_changes',   label: 'Emoji Added / Removed / Renamed' },
  { key: 'log_channel_changes', label: 'Channel Created / Deleted' },
  { key: 'log_server_updates',  label: 'Server Settings Changed' },
];

export async function logsPage(
  user: SessionUser, guild: APIGuild, channels: APIChannel[],
  flash?: string, flashType?: 'success' | 'error'
): Promise<string> {
  const cfg = await db.getLogConfig(guild.id);

  const content = /* html */`
    <form method="POST" action="/servers/${guild.id}/logs">
      <div class="card">
        <h2 class="text-lg font-bold mb-1 text-white">Log Settings</h2>
        <p class="text-sm text-gray-400 mb-5">All enabled events are posted to one log channel.</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          <div class="form-group">
            <label>Enabled</label>
            <select name="enabled">
              <option value="1" ${cfg?.enabled ? 'selected' : ''}>Yes</option>
              <option value="0" ${!cfg?.enabled ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Log Channel</label>
            ${channelSelect('channel_id', channels, cfg?.channel_id)}
          </div>
        </div>

        <h3 class="text-base font-semibold mb-3 text-white">Events to Log</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${LOG_FLAGS.map(f => /* html */`
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="${f.key}" value="1" ${(cfg as any)?.[f.key] ? 'checked' : ''}
                class="w-4 h-4 rounded accent-indigo-500">
              <span class="text-sm text-gray-300">${f.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <button type="submit" class="btn-primary mt-4">Save Changes</button>
    </form>
  `;

  return layout({ title: 'Logs', user, guild, activeHref: `/servers/${guild.id}/logs`, content, flash, flashType });
}

export async function handleLogsSave(guildId: string, body: any): Promise<void> {
  const update: Partial<Omit<db.ILogConfig, 'guild_id'>> = {
    enabled: body.enabled === '1' ? 1 : 0,
    channel_id: body.channel_id || null,
  };
  for (const { key } of LOG_FLAGS) {
    (update as any)[key] = body[key] === '1' ? 1 : 0;
  }
  await db.updateLogConfig(guildId, update);
}
