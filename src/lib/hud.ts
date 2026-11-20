import { chrome, getLang, setLang, type Lang } from './i18n';
import { toast } from './loop';
import { SITE_BASE } from './site';
import { copyText } from './url';

export interface HudRange {
  kind: 'range';
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onInput: (value: number) => void;
  format?: (value: number) => string;
}

export interface HudToggle {
  kind: 'toggle';
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export interface HudSelect {
  kind: 'select';
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export interface HudButton {
  kind: 'button';
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface HudNote {
  kind: 'note';
  text: string;
}

export type HudControl = HudRange | HudToggle | HudSelect | HudButton | HudNote;

export function mountHud(options: {
  title: (lang: Lang) => string;
  shareUrl?: () => string;
  controls: (lang: Lang) => HudControl[];
}): { refresh: () => void; toast: (message: string) => void } {
  const host = document.querySelector('#hud') ?? document.body;
  const root = document.createElement('div');
  root.className = 'hud';
  host.append(root);
  let lang = getLang();
  let collapsed = true;

  const paint = () => {
    root.replaceChildren();
    const strings = chrome[lang];
    if (collapsed) {
      const toggle = document.createElement('button');
      toggle.className = 'hud-toggle';
      toggle.type = 'button';
      toggle.textContent = strings.show;
      toggle.addEventListener('click', () => {
        collapsed = false;
        paint();
      });
      root.append(toggle);
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'hud-panel';
    const head = document.createElement('div');
    head.className = 'hud-head';
    const title = document.createElement('h1');
    title.textContent = options.title(lang);
    const langButton = document.createElement('button');
    langButton.type = 'button';
    langButton.textContent = strings.lang;
    langButton.addEventListener('click', () => {
      lang = lang === 'zh' ? 'en' : 'zh';
      setLang(lang);
      paint();
    });
    head.append(title, langButton);

    const actions = document.createElement('div');
    actions.className = 'hud-actions';
    const home = document.createElement('a');
    home.href = SITE_BASE;
    const homeButton = document.createElement('button');
    homeButton.type = 'button';
    homeButton.textContent = strings.home;
    home.append(homeButton);
    const share = document.createElement('button');
    share.type = 'button';
    share.textContent = strings.share;
    share.addEventListener('click', () => {
      void copyText(options.shareUrl?.() ?? window.location.href).then((ok) => {
        toast(ok ? strings.copied : strings.copyFail);
      });
    });
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.textContent = strings.hide;
    hide.addEventListener('click', () => {
      collapsed = true;
      paint();
    });
    actions.append(home, share, hide);

    const controls = document.createElement('div');
    controls.className = 'hud-controls';
    options.controls(lang).forEach((control) => {
      controls.append(renderControl(control));
    });
    panel.append(head, actions, controls);
    root.append(panel);
  };

  paint();
  return {
    refresh: paint,
    toast,
  };
}

function renderControl(control: HudControl): HTMLElement {
  if (control.kind === 'note') {
    const note = document.createElement('p');
    note.className = 'hud-note';
    note.textContent = control.text;
    return note;
  }
  if (control.kind === 'button') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = control.label;
    if (control.primary) button.classList.add('primary');
    button.addEventListener('click', control.onClick);
    return button;
  }
  if (control.kind === 'toggle') {
    const button = document.createElement('button');
    button.type = 'button';
    const paint = () => {
      button.textContent = `${control.label}: ${control.value ? 'ON' : 'OFF'}`;
    };
    paint();
    button.addEventListener('click', () => {
      control.value = !control.value;
      paint();
      control.onChange(control.value);
    });
    return button;
  }
  if (control.kind === 'select') {
    const label = document.createElement('label');
    label.className = 'row';
    label.textContent = control.label;
    const select = document.createElement('select');
    control.options.forEach((option) => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      if (option.value === control.value) node.selected = true;
      select.append(node);
    });
    select.addEventListener('change', () => {
      control.value = select.value;
      control.onChange(select.value);
    });
    label.append(select);
    return label;
  }
  const label = document.createElement('label');
  label.className = 'row';
  const name = document.createElement('span');
  const readout = document.createElement('strong');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(control.min);
  slider.max = String(control.max);
  slider.step = String(control.step);
  slider.value = String(control.value);
  const paint = () => {
    const value = Number(slider.value);
    name.textContent = control.label;
    readout.textContent = control.format ? control.format(value) : String(value);
  };
  paint();
  slider.addEventListener('input', () => {
    control.value = Number(slider.value);
    paint();
    control.onInput(control.value);
  });
  const text = document.createElement('span');
  text.append(name, ' ', readout);
  label.append(text, slider);
  return label;
}
