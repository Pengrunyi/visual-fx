export interface Greeting {
  to: string;
  msg: string;
  from: string;
}

function clean(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseGreeting(search: string): Greeting {
  const query = search.includes('?') ? search.slice(search.indexOf('?') + 1) : search;
  const hashless = query.split('#')[0] ?? '';
  const params = new URLSearchParams(hashless);
  return {
    to: clean(params.get('to')),
    msg: clean(params.get('msg')),
    from: clean(params.get('from')),
  };
}

export function encodeGreeting(greeting: Greeting): string {
  const params = new URLSearchParams();
  const to = clean(greeting.to);
  const msg = clean(greeting.msg);
  const from = clean(greeting.from);
  if (to) params.set('to', to);
  if (msg) params.set('msg', msg);
  if (from) params.set('from', from);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Build a shareable URL, dropping any previous query or hash. */
export function buildGreetingUrl(originAndPath: string, greeting: Greeting): string {
  const base = originAndPath.split('#')[0]?.split('?')[0] ?? originAndPath;
  return `${base}${encodeGreeting(greeting)}`;
}

export function hasGreeting(greeting: Greeting): boolean {
  return Boolean(greeting.to || greeting.msg || greeting.from);
}
