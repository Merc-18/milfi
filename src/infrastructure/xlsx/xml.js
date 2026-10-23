import { fail } from './zip.js';

// Small non-validating reader for SpreadsheetML parts. It never resolves DTDs,
// external entities or processing instructions: any DOCTYPE/ENTITY is rejected.
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decoder = new TextDecoder('utf-8', { fatal: true });

function decodeText(value) {
  return value.replace(/&([^;\s&]{1,10});/g, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      if (!Number.isSafeInteger(code) || code < 0 || code > 0x10ffff) fail('MALFORMED_XML');
      return String.fromCodePoint(code);
    }
    if (!Object.hasOwn(ENTITIES, entity)) fail('UNSUPPORTED_XML_ENTITY');
    return ENTITIES[entity];
  });
}

function tagEnd(text, from) {
  let quote = null;
  for (let at = from; at < text.length; at++) {
    const char = text[at];
    if (quote) { if (char === quote) quote = null; } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return at;
  }
  return fail('MALFORMED_XML');
}

export function parseXml(source) {
  let text;
  try { text = typeof source === 'string' ? source : decoder.decode(source); } catch { fail('MALFORMED_XML'); }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('XML_DTD_NOT_ALLOWED');
  const documentNode = { name: '#document', local: '#document', attrs: {}, children: [] };
  const stack = [documentNode];
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf('<', at);
    const chunk = text.slice(at, open < 0 ? text.length : open);
    if (chunk && stack.length > 1) stack.at(-1).children.push(decodeText(chunk));
    if (open < 0) break;
    if (text.startsWith('<?', open)) { const close = text.indexOf('?>', open); if (close < 0) fail('MALFORMED_XML'); at = close + 2; continue; }
    if (text.startsWith('<!--', open)) { const close = text.indexOf('-->', open); if (close < 0) fail('MALFORMED_XML'); at = close + 3; continue; }
    if (text.startsWith('<![CDATA[', open)) {
      const close = text.indexOf(']]>', open);
      if (close < 0 || stack.length < 2) fail('MALFORMED_XML');
      stack.at(-1).children.push(text.slice(open + 9, close));
      at = close + 3;
      continue;
    }
    const close = tagEnd(text, open + 1);
    if (text[open + 1] === '/') {
      const name = text.slice(open + 2, close).trim();
      const element = stack.pop();
      if (stack.length < 1 || element.name !== name) fail('MALFORMED_XML');
      at = close + 1;
      continue;
    }
    const raw = text.slice(open + 1, close);
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const name = /^[^\s/>]+/.exec(body)?.[0];
    if (!name) fail('MALFORMED_XML');
    const attrs = {};
    const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let rest = body.slice(name.length);
    for (const match of rest.matchAll(pattern)) attrs[match[1]] = decodeText(match[2] ?? match[3]);
    rest = rest.replace(pattern, '');
    if (rest.trim()) fail('MALFORMED_XML');
    const element = { name, local: name.split(':').pop(), attrs, children: [] };
    if (stack.length === 1 && documentNode.children.length) fail('MALFORMED_XML');
    stack.at(-1).children.push(element);
    if (!selfClosing) stack.push(element);
    at = close + 1;
  }
  if (stack.length !== 1 || documentNode.children.length !== 1) fail('MALFORMED_XML');
  return documentNode.children[0];
}

export const elements = (node, local) => (node?.children ?? []).filter(child => typeof child !== 'string' && (!local || child.local === local));
export const element = (node, local) => elements(node, local)[0] ?? null;
export const attribute = (node, local) => {
  const key = Object.keys(node?.attrs ?? {}).find(name => name === local || name.split(':').pop() === local);
  return key === undefined ? null : node.attrs[key];
};
export function textContent(node) {
  if (!node) return '';
  return node.children.map(child => typeof child === 'string' ? child : textContent(child)).join('');
}
