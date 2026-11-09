// Builds the static dashboard into ./dist from the repository's checklist YAML.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { marked } from 'marked';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'dist');
const yamlPath = process.env.CHECKLIST_YAML || path.join(root, 'personal-security-checklist.yml');
const iconPath = path.join(root, 'web/src/components/core/icon.tsx');

// Links in content open in a new tab, without leaking the referrer.
marked.use({
  renderer: {
    link(href, title, text) {
      const t = title ? ` title="${title}"` : '';
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});
const md = (s) => (s ? marked.parse(String(s), { async: false }).trim() : '');
const mdInline = (s) => (s ? marked.parseInline(String(s), { async: false }).trim() : '');
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normPriority = (p) => {
  const v = String(p || '').toLowerCase();
  if (v === 'essential' || v === 'basic') return 'essential';
  if (v === 'advanced') return 'advanced';
  return 'optional';
};

const raw = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
const links = (arr) => (arr || []).map((l) => ({ title: l.title, url: l.url, description: l.description || '' }));

const sections = raw.map((s) => {
  const seen = new Set();
  return {
    title: s.title,
    slug: s.slug || slugify(s.title),
    description: s.description || '',
    intro: md(s.intro),
    icon: s.icon || 'shield',
    color: s.color || 'blue',
    softwareLinks: links(s.softwareLinks),
    helpfulTools: links(s.helpfulTools),
    furtherResources: links(s.furtherResources),
    checklist: (s.checklist || []).map((c) => {
      let id = slugify(c.point);
      while (seen.has(id)) id += '-x';
      seen.add(id);
      return { id, point: c.point, pointHtml: mdInline(c.point), priority: normPriority(c.priority), details: md(c.details) };
    }),
  };
});

// Re-use the SVG icon paths from the main web app.
const icons = {};
if (fs.existsSync(iconPath)) {
  const src = fs.readFileSync(iconPath, 'utf8');
  const re = /case '([\w-]+)':\s*return\s*{\s*vb:\s*"([^"]*)",\s*path:\s*"([^"]*)"/g;
  for (const m of src.matchAll(re)) icons[m[1]] = { vb: m[2], path: m[3] };
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(path.join(here, 'src'))) {
  fs.copyFileSync(path.join(here, 'src', f), path.join(out, f));
}
const data = { generated: new Date().toISOString(), sections, icons };
fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(data));

const count = sections.reduce((n, s) => n + s.checklist.length, 0);
console.log(`Built ${sections.length} sections / ${count} items, ${Object.keys(icons).length} icons -> ${out}`);
