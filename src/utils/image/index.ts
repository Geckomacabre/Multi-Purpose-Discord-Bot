import { ChatInputCommandInteraction, Message, AttachmentBuilder } from 'discord.js';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS_DIR = path.join(__dirname, '../../assets');
export const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
export const IMAGES_DIR = path.join(ASSETS_DIR, 'images');

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/mov', 'image/gif']);

export interface ImageResult {
  buffer: Buffer;
  ext: string;
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

export async function getOutputType(buffer: Buffer, forceGif = false): Promise<string> {
  const meta = await sharp(buffer, { animated: true }).metadata();
  if (forceGif || (meta.pages && meta.pages > 1)) return 'gif';
  return meta.format === 'jpeg' ? 'jpg' : (meta.format ?? 'png');
}

export function imageReply(buffer: Buffer, ext: string): { files: AttachmentBuilder[] } {
  return { files: [new AttachmentBuilder(buffer, { name: `result.${ext}` })] };
}

export async function normalizeImage(buffer: Buffer, maxSize = 800): Promise<Buffer> {
  const img = sharp(buffer, { animated: true });
  const meta = await img.metadata();
  const w = meta.width ?? 800;
  const h = (meta.height ?? 800) / (meta.pages ?? 1);
  if (w <= maxSize && h <= maxSize) return buffer;
  const scale = maxSize / Math.max(w, h);
  return img.resize(Math.round(w * scale), Math.round(h * scale)).toBuffer();
}
