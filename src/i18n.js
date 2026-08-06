import { translations } from './translations.js';

const STORAGE_KEY = 'zv2.language';
const ATTRS = ['title', 'aria-label', 'placeholder', 'data-tip'];
let language = localStorage.getItem(STORAGE_KEY)
  || (navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en');
let observer;

export const getLanguage = () => language;

// Fragment matcher, built once per language. Exact entries are looked up first;
// this only handles phrases embedded in dynamic strings ("Storage is full", canvas
// labels built from templates, server messages glued to names and numbers).
//
// One alternation replaced in a single left-to-right pass, longest key first: a
// replacement is never re-scanned, so German output can't match another English
// key. Letter boundaries keep "Metal" out of the middle of a longer word while
// still allowing keys that end in punctuation followed by a number.
const LETTER = 'A-Za-z\\u00C0-\\u024F';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let matcher = { lang: null, re: null, dict: {} };

function fragmentMatcher(lang) {
  if (matcher.lang !== lang) {
    const dict = translations[lang] || {};
    const keys = Object.keys(dict)
      .filter((key) => key.length >= 4)
      .sort((a, b) => b.length - a.length);
    matcher = {
      lang,
      dict,
      re: keys.length
        ? new RegExp(`(?<![${LETTER}])(?:${keys.map(escapeRe).join('|')})(?![${LETTER}])`, 'g')
        : null,
    };
  }
  return matcher;
}

// Translates exact entries first, then phrases embedded in dynamic strings.
export function t(value, lang = language) {
  if (value == null || lang === 'en') return String(value ?? '');
  const dict = translations[lang] || {};
  const source = String(value);
  if (dict[source] != null) return dict[source];
  const { re } = fragmentMatcher(lang);
  if (!re) return source;
  re.lastIndex = 0;
  return source.replace(re, (match) => dict[match] ?? match);
}

// Nodes remember the English they were rendered from. Re-reading the source only
// when the app itself rewrote the node is what lets a switch back to English
// restore the original text instead of freezing the German in place.
function translateTextNode(node) {
  if (!node.nodeValue?.trim()) return;
  if (node.parentElement?.closest('script,style,input,textarea,[data-i18n-ignore]')) return;
  const current = node.nodeValue;
  if (node.__zv2Source == null || current !== node.__zv2Rendered) node.__zv2Source = current;
  const next = t(node.__zv2Source);
  node.__zv2Rendered = next;
  if (next !== current) node.nodeValue = next;
}

function translateAttr(el, attr) {
  const store = el.__zv2Attrs || (el.__zv2Attrs = {});
  const slot = store[attr] || (store[attr] = {});
  const current = el.getAttribute(attr);
  if (slot.source == null || current !== slot.rendered) slot.source = current;
  const next = t(slot.source);
  slot.rendered = next;
  if (next !== current) el.setAttribute(attr, next);
}

function translateElement(el) {
  if (!(el instanceof Element)) return;
  for (const attr of ATTRS) {
    if (el.hasAttribute(attr)) translateAttr(el, attr);
  }
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
  }
}

export function translatePage(root = document.body) {
  observer?.disconnect();
  document.documentElement.lang = language;
  translateElement(root);
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function setLanguage(next) {
  language = next === 'de' ? 'de' : 'en';
  localStorage.setItem(STORAGE_KEY, language);
  translatePage();
  document.dispatchEvent(new CustomEvent('zv2:languagechange', { detail: { language } }));
}

export function initI18n() {
  const button = document.getElementById('languagebtn');
  const syncButton = () => {
    if (!button) return;
    button.textContent = language === 'de' ? 'EN' : 'DE';
    button.title = language === 'de' ? 'Switch to English' : 'Auf Deutsch umschalten';
    button.setAttribute('aria-label', button.title);
  };
  button?.addEventListener('click', () => {
    setLanguage(language === 'de' ? 'en' : 'de');
    syncButton();
  });
  observer = new MutationObserver((mutations) => {
    observer.disconnect();
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateTextNode(mutation.target);
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
        else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
      }
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  syncButton();
  translatePage();
}
