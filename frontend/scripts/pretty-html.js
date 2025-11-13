const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || path.join(process.cwd(), 'catalogo.html');
const src = fs.readFileSync(filePath, 'utf8');

const voidTags = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'
]);

function repeat(ch, n) {
  return n > 0 ? ch.repeat(n) : '';
}

function isStartTag(tag) {
  return /^<[^\/>!][^>]*>$/.test(tag);
}

function isEndTag(tag) {
  return /^<\//.test(tag);
}

function getTagName(tag) {
  const m = tag.match(/^<\/?([a-zA-Z0-9:-]+)/);
  return m ? m[1].toLowerCase() : '';
}

function isSelfClosing(tag) {
  if (/\/>\s*$/.test(tag)) return true;
  const name = getTagName(tag);
  return voidTags.has(name);
}

function formatHTML(html) {
  const tokens = [];
  const regex = /(<!--[\s\S]*?--\s*>)|(<!DOCTYPE[^>]*>)|(<script\b[\s\S]*?<\/script\s*>)|(<style\b[\s\S]*?<\/style\s*>)|(<[^>]+>)/gi;
  let lastIndex = 0;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: 'text', value: html.slice(lastIndex, m.index) });
    }
    const value = m[0];
    if (m[1]) tokens.push({ type: 'comment', value });
    else if (m[2]) tokens.push({ type: 'doctype', value });
    else if (m[3]) tokens.push({ type: 'script', value });
    else if (m[4]) tokens.push({ type: 'style', value });
    else tokens.push({ type: 'tag', value });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < html.length) {
    tokens.push({ type: 'text', value: html.slice(lastIndex) });
  }

  const lines = [];
  let indent = 0;
  const stack = [];

  function pushLine(str) {
    lines.push(repeat('  ', indent) + str);
  }

  function pushBlockContent(content, extraIndent = 1) {
    const pad = repeat('  ', indent + extraIndent);
    const parts = content.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < parts.length; i++) {
      const line = parts[i];
      if (line.length === 0) {
        lines.push('');
      } else {
        lines.push(pad + line);
      }
    }
  }

  function handleText(text) {
    if (!text) return;
    const inPre = stack.length && (stack[stack.length - 1] === 'pre' || stack[stack.length - 1] === 'textarea');
    if (inPre) {
      const normalized = text.replace(/\r\n/g, '\n');
      const parts = normalized.split('\n');
      for (const part of parts) {
        if (part.length) lines.push(repeat('  ', indent) + part);
        else lines.push('');
      }
      return;
    }
    const collapsed = text.replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (collapsed) pushLine(collapsed);
  }

  for (const tok of tokens) {
    if (tok.type === 'text') {
      handleText(tok.value);
      continue;
    }

    if (tok.type === 'doctype') {
      pushLine(tok.value.trim());
      continue;
    }

    if (tok.type === 'comment') {
      const content = tok.value.replace(/\r\n/g, '\n');
      const parts = content.split('\n');
      for (const part of parts) {
        pushLine(part);
      }
      continue;
    }

    if (tok.type === 'script' || tok.type === 'style') {
      const name = tok.type;
      const openMatch = tok.value.match(new RegExp(`<${name}\\b[^>]*>`, 'i'));
      const closeMatch = tok.value.match(new RegExp(`</${name}\\s*>`, 'i'));
      if (openMatch && closeMatch) {
        const start = openMatch.index + openMatch[0].length;
        const end = closeMatch.index;
        const inner = tok.value.slice(start, end);
        const openTag = openMatch[0];
        const closeTag = closeMatch[0];
        pushLine(openTag);
        if (inner.trim().length) {
          pushBlockContent(inner, 1);
        }
        pushLine(closeTag);
      } else {
        pushLine(tok.value.trim());
      }
      continue;
    }

    const tag = tok.value.trim();

    if (isEndTag(tag)) {
      const name = getTagName(tag);
      if (stack.length && stack[stack.length - 1] === name) {
        indent = Math.max(indent - 1, 0);
        stack.pop();
      } else if (indent > 0) {
        indent = Math.max(indent - 1, 0);
      }
      pushLine(tag);
      continue;
    }

    if (isStartTag(tag)) {
      const name = getTagName(tag);
      pushLine(tag);
      if (!isSelfClosing(tag)) {
        stack.push(name);
        indent += 1;
      }
      continue;
    }

    pushLine(tag);
  }

  return lines.join('\n').replace(/[ \t]+\n/g, '\n') + '\n';
}

const out = formatHTML(src);
fs.writeFileSync(filePath, out, 'utf8');
console.log('Formatted:', path.relative(process.cwd(), filePath));

