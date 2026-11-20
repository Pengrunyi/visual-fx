import '../styles/hub.css';
import { previews } from './previews';
import { chrome, getLang, setLang, type Lang } from '../lib/i18n';
import { toast } from '../lib/loop';
import { joinBase, scenes } from '../lib/scenes';
import { copyText, pageUrl } from '../lib/url';

const top = document.querySelector<HTMLElement>('#top');
const grid = document.querySelector<HTMLElement>('#grid');
const footer = document.querySelector<HTMLElement>('#footer-note');
if (!top || !grid || !footer) throw new Error('missing hub nodes');

const cards = new Map<string, { title: HTMLElement; blurb: HTMLElement; open: HTMLElement; copy: HTMLButtonElement }>();

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
    const card = document.createElement('article');
    card.className = 'card';
    card.style.borderColor = `${scene.accent}55`;
    const preview = document.createElement('canvas');
    preview.width = 480;
    preview.height = 270;
    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('h2');
    const blurb = document.createElement('p');
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const openLink = document.createElement('a');
    openLink.href = joinBase(import.meta.env.BASE_URL, scene.route);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'primary';
    openLink.append(open);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.addEventListener('click', () => {
      const langNow = getLang();
      void copyText(pageUrl(scene.route)).then((ok) => {
        toast(ok ? chrome[langNow].copied : chrome[langNow].copyFail);
      });
    });
    actions.append(openLink, copy);
    body.append(title, blurb, actions);
    card.append(preview, body);
    grid!.append(card);
    cards.set(scene.slug, { title, blurb, open, copy });
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
