const parseTags = (raw) => {
    const tags = {};
    raw.split(";").forEach((pair) => {
        const [key, value = ""] = pair.split("=");
        if (!key)
            return;
        tags[key] = value;
    });
    return tags;
};
export const parseIrcMessage = (line) => {
    if (!line.trim())
        return null;
    let cursor = line;
    let tags = {};
    let prefix;
    if (cursor.startsWith("@")) {
        const spaceIndex = cursor.indexOf(" ");
        if (spaceIndex === -1)
            return null;
        tags = parseTags(cursor.slice(1, spaceIndex));
        cursor = cursor.slice(spaceIndex + 1);
    }
    if (cursor.startsWith(":")) {
        const spaceIndex = cursor.indexOf(" ");
        if (spaceIndex === -1)
            return null;
        prefix = cursor.slice(1, spaceIndex);
        cursor = cursor.slice(spaceIndex + 1);
    }
    const trailingIndex = cursor.indexOf(" :");
    let trailing;
    if (trailingIndex !== -1) {
        trailing = cursor.slice(trailingIndex + 2);
        cursor = cursor.slice(0, trailingIndex);
    }
    const parts = cursor.split(" ").filter(Boolean);
    if (!parts.length)
        return null;
    return {
        tags,
        prefix,
        command: parts[0],
        params: parts.slice(1),
        trailing
    };
};
