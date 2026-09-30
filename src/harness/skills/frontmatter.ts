export interface Frontmatter { name: string; description: string }

function unquote(v: string): string {
  const t = v.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
}

/** Reads `name` and `description` from a SKILL.md YAML header. Only single-line values, which is all skills use. */
export function parseFrontmatter(md: string): Frontmatter | null {
  const text = md.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---/.exec(text) ?? /^---\n([\s\S]*)$/.exec(text);
  if (!m) return null;
  const get = (key: string) => {
    const line = m[1].split("\n").find((l) => l.startsWith(`${key}:`));
    return line ? unquote(line.slice(key.length + 1)) : "";
  };
  const name = get("name");
  return name ? { name, description: get("description") } : null;
}
