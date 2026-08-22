import { EventModule } from '../feature';

// Cache of known phishing domains fetched from sinking.yachts
let phishingDomains = new Set<string>();
let lastFetch = 0;

async function refreshDomains() {
  try {
    const res = await fetch('https://phish.sinking.yachts/v2/all', {
      headers: { 'X-Identity': 'TMCBot antiphishing' },
    });
    if (!res.ok) return;
    const list: string[] = await res.json();
    phishingDomains = new Set(list.map(d => d.toLowerCase()));
    lastFetch = Date.now();
  } catch {}
}

// Refresh every 30 minutes
refreshDomains();
setInterval(refreshDomains, 30 * 60 * 1000);

const URL_RE = /https?:\/\/([^\s/]+)/gi;

function extractDomains(text: string): string[] {
  const domains: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    domains.push(m[1].toLowerCase().replace(/^www\./, ''));
  }
  return domains;
}

const antiphishingModule: EventModule = {
  name: 'antiphishing',
  handlers: {
    messageCreate: async ({ data: [message] }) => {
      if (!message.guildId || !message.content || message.author?.bot) return;
      if (!phishingDomains.size) return;
      const domains = extractDomains(message.content);
      const hit = domains.find(d => phishingDomains.has(d));
      if (!hit) return;
      await message.delete().catch(() => {});
      await message.channel.send(
        `🚨 <@${message.author.id}> **Phishing link detected and removed.** The domain \`${hit}\` is a known phishing site.`
      ).then(m => setTimeout(() => m.delete().catch(() => {}), 10_000)).catch(() => {});
    },
  },
};

export default antiphishingModule;
