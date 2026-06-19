import { ChatInputCommandInteraction } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { cv2File } from '../components.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS_DIR = path.join(__dirname, '../../assets');
export const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
export const IMAGES_DIR = path.join(ASSETS_DIR, 'images');

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

export function sniffType(buf: Buffer): string {
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
  return 'png';
}

export async function getImageBuffer(interaction: ChatInputCommandInteraction): Promise<Buffer> {
  const attachment = interaction.options.getAttachment('image');
  if (attachment) {
    if (!IMAGE_MIME.has(attachment.contentType ?? '')) throw new Error('Attachment must be an image.');
    const res = await fetch(attachment.url);
    return Buffer.from(await res.arrayBuffer());
  }

  if (interaction.channel && 'messages' in interaction.channel) {
    const messages = await interaction.channel.messages.fetch({ limit: 20 });
    for (const [, msg] of messages) {
      for (const att of msg.attachments.values()) {
        if (IMAGE_MIME.has(att.contentType ?? '')) {
          const res = await fetch(att.url);
          return Buffer.from(await res.arrayBuffer());
        }
      }
      for (const embed of msg.embeds) {
        const imgUrl = embed.image?.url ?? embed.thumbnail?.url;
        if (imgUrl) {
          const res = await fetch(imgUrl);
          return Buffer.from(await res.arrayBuffer());
        }
      }
    }
  }

  throw new Error('No image found. Attach an image or use the command near a recent image.');
}

export function imageReply(buffer: Buffer, ext: string) {
  return cv2File(buffer, ext);
}
