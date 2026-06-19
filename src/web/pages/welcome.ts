import { layout, escHtml, channelSelect } from '../layout';
import type { SessionUser } from '../session';
import type { APIGuild, APIChannel } from '../discord';
import * as db from '../../utils/db';

export async function welcomePage(
  user: SessionUser, guild: APIGuild, channels: APIChannel[],
  flash?: string, flashType?: 'success' | 'error'
): Promise<string> {
  const cfg = await db.getWelcomeConfig(guild.id);

  const content = /* html */`
    <form method="POST" action="/servers/${guild.id}/welcome">
      <div class="card">
        <h2 class="text-lg font-bold mb-5 text-white">Welcome Messages</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div class="form-group">
            <label>Enabled</label>
            <select name="enabled">
              <option value="1" ${cfg?.enabled ? 'selected' : ''}>Yes</option>
              <option value="0" ${!cfg?.enabled ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Welcome Channel</label>
            ${channelSelect('channel_id', channels, cfg?.channel_id)}
          </div>
        </div>
        <div class="form-group">
          <label>Welcome Message</label>
          <textarea name="message" rows="3" placeholder="Welcome {user} to **{server}**!">${escHtml(cfg?.message ?? '')}</textarea>
          <div class="text-xs text-gray-500 mt-1">Variables: {user} {username} {server} {membercount}</div>
        </div>
        <div class="form-group">
          <label>DM Message <span class="text-gray-500">(optional — sent directly to new members)</span></label>
          <textarea name="dm_message" rows="2" placeholder="Welcome to {server}! Check out the rules.">${escHtml(cfg?.dm_message ?? '')}</textarea>
        </div>
      </div>
      <button type="submit" class="btn-primary">Save Changes</button>
    </form>
  `;

  return layout({ title: 'Welcome', user, guild, activeHref: `/servers/${guild.id}/welcome`, content, flash, flashType });
}

export async function handleWelcomeSave(guildId: string, body: any): Promise<void> {
  await db.setWelcomeConfig(guildId, {
    enabled: body.enabled === '1' ? 1 : 0,
    channel_id: body.channel_id || null,
    message: body.message?.trim() || 'Welcome {user} to **{server}**!',
    dm_message: body.dm_message?.trim() || null,
  });
}
