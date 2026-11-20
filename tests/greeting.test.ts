import { describe, expect, it } from 'vitest';
import { buildGreetingUrl, encodeGreeting, hasGreeting, parseGreeting } from '../src/lib/greeting';

describe('christmas greeting links', () => {
  it('round-trips Chinese greeting fields', () => {
    const greeting = { to: '朋友', msg: '圣诞快乐', from: '署名' };
    const encoded = encodeGreeting(greeting);
    expect(parseGreeting(encoded)).toEqual(greeting);
    expect(hasGreeting(greeting)).toBe(true);
  });

  it('drops empty fields and previous queries', () => {
    expect(encodeGreeting({ to: '', msg: '  ', from: '' })).toBe('');
    expect(parseGreeting('')).toEqual({ to: '', msg: '', from: '' });
    expect(parseGreeting('?to=%20hi%20&msg=a')).toEqual({ to: 'hi', msg: 'a', from: '' });
    const url = buildGreetingUrl(
      'https://pengrunyi.github.io/visual-fx/christmas/?old=1#hash',
      { to: '朋友', msg: '圣诞快乐', from: '署名' },
    );
    expect(url.startsWith('https://pengrunyi.github.io/visual-fx/christmas/?')).toBe(true);
    expect(url.includes('#')).toBe(false);
    expect(url.includes('old=')).toBe(false);
    expect(parseGreeting(url.slice(url.indexOf('?')))).toEqual({
      to: '朋友',
      msg: '圣诞快乐',
      from: '署名',
    });
  });
});
