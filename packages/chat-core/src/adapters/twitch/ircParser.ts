export type IrcMessage = {
  tags: Record<string, string>;
  prefix?: string;
  command: string;
  params: string[];
  trailing?: string;
};

const parseTags = (raw: string): Record<string, string> => {
  const tags: Record<string, string> = {};
  raw.split(";").forEach((pair) => {
    const [key, value = ""] = pair.split("=");
    if (!key) return;
    tags[key] = value;
  });
  return tags;
};

export const parseIrcMessage = (line: string): IrcMessage | null => {
  if (!line.trim()) return null;
  let cursor = line;
  let tags: Record<string, string> = {};
  let prefix: string | undefined;

  if (cursor.startsWith("@")) {
    const spaceIndex = cursor.indexOf(" ");
    if (spaceIndex === -1) return null;
    tags = parseTags(cursor.slice(1, spaceIndex));
    cursor = cursor.slice(spaceIndex + 1);
  }

  if (cursor.startsWith(":")) {
    const spaceIndex = cursor.indexOf(" ");
    if (spaceIndex === -1) return null;
    prefix = cursor.slice(1, spaceIndex);
    cursor = cursor.slice(spaceIndex + 1);
  }

  const trailingIndex = cursor.indexOf(" :");
  let trailing: string | undefined;
  if (trailingIndex !== -1) {
    trailing = cursor.slice(trailingIndex + 2);
    cursor = cursor.slice(0, trailingIndex);
  }

  const parts = cursor.split(" ").filter(Boolean);
  if (!parts.length) return null;

  return {
    tags,
    prefix,
    command: parts[0],
    params: parts.slice(1),
    trailing
  };
};
