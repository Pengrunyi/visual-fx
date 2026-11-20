export type Lang = 'zh' | 'en';

const KEY = 'vfx-lang';

export function getLang(): Lang {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* private mode */
  }
}

export const chrome = {
  zh: {
    collection: '视觉特效合集',
    tagline: '八个零外链的 WebGL / GLSL 互动场景，可在微信里直接全屏打开。',
    open: '打开场景',
    copy: '复制直达链接',
    copied: '链接已复制',
    copyFail: '复制失败，请长按链接',
    lang: 'EN',
    home: '← 合集',
    share: '复制分享链接',
    hide: '隐藏面板',
    show: '控制',
    footer: '本地合成 · 无外部字体与 CDN',
  },
  en: {
    collection: 'Visual FX',
    tagline: 'Eight self-contained WebGL / GLSL scenes that open fullscreen in WeChat.',
    open: 'Open scene',
    copy: 'Copy direct link',
    copied: 'Link copied',
    copyFail: 'Copy failed',
    lang: '中',
    home: '← Gallery',
    share: 'Copy share link',
    hide: 'Hide panel',
    show: 'Controls',
    footer: 'Local synthesis · no external fonts or CDNs',
  },
} as const;
