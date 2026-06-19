import { AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';

export const IS_CV2 = MessageFlags.IsComponentsV2;

export function cv2Text(content: string, accentColor?: number) {
  const c = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  if (accentColor !== undefined) c.setAccentColor(accentColor);
  return { flags: IS_CV2, components: [c] };
}

export function cv2File(buffer: Buffer, ext: string, caption?: string) {
  const name = `result.${ext}`;
  const c = new ContainerBuilder();
  if (caption) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(caption));
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`)));
  return { flags: IS_CV2, files: [new AttachmentBuilder(buffer, { name })], components: [c] };
}
