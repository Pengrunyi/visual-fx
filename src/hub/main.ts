import '../styles/hub.css';
import { previews } from './previews';
import { chrome, getLang, setLang, type Lang } from '../lib/i18n';
import { toast } from '../lib/loop';
import { freshSlugs, joinBase, scenes } from '../lib/scenes';
import { copyText, pageUrl } from '../lib/url';

const top = document.querySelector<HTMLElement>('#top');
const grid = document.querySelector<HTMLElement>('#grid');
const footer = document.querySelector<HTMLElement>('#footer-note');
if (!top || !grid || !footer) throw new Error('missing hub nodes');

const cards = new Map<string, {
  title: HTMLElement;
  blurb: HTMLElement;
  open: HTMLElement;
  copy: HTMLButtonElement;
  badge: HTMLElement | null;
}>();

function text(lang: Lang) {
  return chrome[lang];
}

function renderStatic() {
  const lang = getLang();
  const strings = text(lang);
  top!.replaceChildren();
  const headingWrap = document.createElement('div');
  const heading = document.createElement('h1');
  heading.textContent = strings.collection;
  const tagline = document.createElement('p');
  tagline.textContent = strings.tagline;
  headingWrap.append(heading, tagline);
  const langButton = document.createElement('button');
  langButton.type = 'button';
  langButton.textContent = strings.lang;
  langButton.addEventListener('click', () => {
    setLang(lang === 'zh' ? 'en' : 'zh');
    renderStatic();
    refreshCards();
  });
  top!.append(headingWrap, langButton);
  footer!.textContent = strings.footer;

  if (cards.size > 0) return;
  scenes.forEach((scene) => {
    const href = joinBase(import.meta.env.BASE_URL, scene.route);
    const card = document.createElement('article');
    card.className = 'card';
    card.style.borderColor = `${scene.accent}55`;
    const link = document.createElement('a');
    link.className = 'card-link';
    link.href = href;
    const preview = document.createElement('canvas');
    preview.width = 480;
    preview.height = 270;
    preview.setAttribute('aria-hidden', 'true');
    let badge: HTMLElement | null = null;
    if (freshSlugs.has(scene.slug)) {
      badge = document.createElement('span');
      badge.className = 'badge';
    }
    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('h2');
    const blurb = document.createElement('p');
    body.append(title, blurb);
    if (badge) link.append(badge);
    link.append(preview, body);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const open = document.createElement('span');
    open.className = 'primary';
    open.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy';
    copy.addEventListener('click', () => {
      const langNow = getLang();
      void copyText(pageUrl(scene.route)).then((ok) => {
        toast(ok ? chrome[langNow].copied : chrome[langNow].copyFail);
      });
    });
    actions.append(open, copy);
    card.append(link, actions);
    grid!.append(card);
    cards.set(scene.slug, { title, blurb, open, copy, badge });
    const context = preview.getContext('2d');
    if (context) contexts.push({ slug: scene.slug, ctx: context, canvas: preview });
  });
  refreshCards();
}

function refreshCards() {
  const lang = getLang();
  const strings = text(lang);
  scenes.forEach((scene) => {
    const card = cards.get(scene.slug);
    if (!card) return;
    card.title.replaceChildren();
    card.title.append(document.createTextNode(lang === 'zh' ? scene.titleZh : scene.titleEn));
    if (lang === 'zh') {
      const en = document.createElement('span');
      en.className = 'en';
      en.textContent = scene.titleEn;
      card.title.append(en);
    }
    card.blurb.textContent = lang === 'zh' ? scene.blurbZh : scene.blurbEn;
    card.open.textContent = strings.open;
    card.copy.textContent = strings.copy;
    if (card.badge) card.badge.textContent = lang === 'zh' ? '新' : 'New';
  });
}

const contexts: { slug: string; ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement }[] = [];
renderStatic();

const started = performance.now();
const paint = (now: number) => {
  const time = (now - started) / 1000;
  contexts.forEach(({ slug, ctx, canvas: preview }) => {
    const draw = previews[slug];
    if (!draw) return;
    draw(ctx, time, preview.width, preview.height);
  });
  requestAnimationFrame(paint);
};
requestAnimationFrame(paint);
