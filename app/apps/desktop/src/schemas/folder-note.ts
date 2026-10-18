import { z } from 'zod';

/**
 * An optional sibling "folder note" (`<folder>.md`, next to its folder) carrying a
 * workspace's or suite's metadata: a friendly display `name` and an inheritable
 * `displayIdPrefix` in the front matter, with the markdown **body** as the description.
 *
 * The note is lazy — it only exists on disk when it has something to say (a custom name,
 * a prefix, or a description). A note-less folder is the norm and works fine; its folder
 * name is used as the display name. Parsing is tolerant: blank/missing coerces to defaults.
 */
export const FolderNoteFrontSchema = z.looseObject({
  name: z.coerce.string().default(''),
  displayIdPrefix: z.coerce.string().default(''),
});

export type FolderNoteFront = z.infer<typeof FolderNoteFrontSchema>;
