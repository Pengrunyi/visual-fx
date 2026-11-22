export interface SceneInfo {
  slug: string;
  route: string;
  titleZh: string;
  titleEn: string;
  pageTitle: string;
  blurbZh: string;
  blurbEn: string;
  description: string;
  accent: string;
  accent2: string;
}

export const scenes: readonly SceneInfo[] = [
  {
    slug: 'black-hole',
    route: '/black-hole/',
    titleZh: '卡冈图雅黑洞',
    titleEn: 'Gargantua',
    pageTitle: '卡冈图雅黑洞 · Gargantua',
    blurbZh: '施瓦西测地线光线弯曲、光子环与开普勒吸积盘。',
    blurbEn: 'Schwarzschild lensing, a photon ring, and a Keplerian disk.',
    description:
      '实时 GPU 光线步进施瓦西测地线：光子环、分层吸积盘、星场透镜，可点燃耀斑并播放合成管风琴。',
    accent: '#ffb15a',
    accent2: '#ff5a1f',
  },
  {
    slug: 'fluid',
    route: '/fluid/',
    titleZh: '霓虹流体动力学',
    titleEn: 'Neon Fluid',
    pageTitle: '霓虹流体动力学 · Neon Fluid',
    blurbZh: '多点触控 GPU 纳维-斯托克斯流体与辉光染料。',
    blurbEn: 'Multi-touch GPU Navier–Stokes dye with bloom.',
    description:
      '实时多通道 GPU 流体求解：涡量约束、压力迭代与染料平流。拖拽溅起霓虹涡流，可截图保存。',
    accent: '#3df0ff',
    accent2: '#ff3df0',
  },
  {
    slug: 'galaxy',
    route: '/galaxy/',
    titleZh: '深空粒子星系',
    titleEn: 'Argon Galaxy',
    pageTitle: '深空粒子星系 · Argon Galaxy',
    blurbZh: '数万粒子螺旋星系，触摸触发超新星斥力。',
    blurbEn: 'A spiral of tens of thousands of particles you can scatter.',
    description:
      'WebGL2 自定义着色器螺旋星系，默认五万粒子，可调旋臂、转速与配色，点击或长按激起超新星。',
    accent: '#8b7cff',
    accent2: '#5ce1ff',
  },
  {
    slug: 'aurora',
    route: '/aurora/',
    titleZh: '极光雪夜',
    titleEn: 'GLSL Aurora',
    pageTitle: '极光雪夜 · GLSL Aurora',
    blurbZh: '体积极光帷幕、山影、星空与前景飘雪。',
    blurbEn: 'Volumetric curtains, ridgelines, stars, and drifting snow.',
    description:
      '程序化 GLSL 极光在雪山上摇曳。滑动照亮光带，双击触发地磁爆发，可调色板、速度与降雪。',
    accent: '#3dffb0',
    accent2: '#7af0ff',
  },
  {
    slug: 'fireworks',
    route: '/fireworks/',
    titleZh: '夜空物理烟花',
    titleEn: 'Firework Show',
    pageTitle: '夜空物理烟花 · Firework Show',
    blurbZh: '菊、柳、环、连爆、心形与螺旋高辉光烟花。',
    blurbEn: 'Chrysanthemum, willow, ring, double-burst, heart, and spiral shells.',
    description:
      '多级 Canvas 物理烟花，加色拖尾与合成升空哨音、爆裂低音。点击夜空即可发射，也可自动表演。',
    accent: '#ffd36a',
    accent2: '#ff4d6d',
  },
  {
    slug: 'christmas',
    route: '/christmas/',
    titleZh: '星光粒子圣诞树',
    titleEn: 'Starlight Christmas',
    pageTitle: '星光粒子圣诞树 · Starlight Christmas',
    blurbZh: '粒子圣诞树、贺卡链接、音乐盒与圣诞老人。',
    blurbEn: 'A particle tree, greeting links, a music box, and Santa.',
    description:
      '可交互星光粒子圣诞树，形态可变为祝福文字。支持 ?to=&msg=&from= 贺卡参数，并复制微信直达链接。',
    accent: '#ff5a6a',
    accent2: '#7dffb3',
  },
  {
    slug: 'snow-globe',
    route: '/snow-globe/',
    titleZh: '3D 水晶球音乐盒',
    titleEn: 'Winter Snow Globe',
    pageTitle: '3D 水晶球音乐盒 · Winter Snow Globe',
    blurbZh: '玻璃球中的小屋、松林、灯火与几千片雪。',
    blurbEn: 'A glass sphere with a cabin, pines, lantern light, and snow.',
    description:
      '木座上的三维水晶球：微缩木屋、松树与灯笼。拖拽或摇晃搅动风雪，可切换昼夜与合成音乐盒。',
    accent: '#d7e6ff',
    accent2: '#c08a4e',
  },
  {
    slug: 'music-reactor',
    route: '/music-reactor/',
    titleZh: '音画频谱星环',
    titleEn: 'Audio Shader Lab',
    pageTitle: '音画频谱星环 · Audio Shader Lab',
    blurbZh: '合成节拍、本地音频或麦克风驱动四种着色器。',
    blurbEn: 'Four shaders driven by a synth, a file, or the microphone.',
    description:
      '实时 Web Audio 频谱分析。内置合成鼓点即可开演，也可载入本地音频或麦克风，在四种 GLSL 视觉间切换。',
    accent: '#ff4fd8',
    accent2: '#4d7cff',
  },
  {
    slug: 'milk-frog',
    route: '/milk-frog/',
    titleZh: '奶蛙手势互动',
    titleEn: 'Milk Frog',
    pageTitle: '奶蛙手势互动 · Milk Frog',
    blurbZh: '挥手、比耶、握拳或按住张掌，奶蛙会回应。',
    blurbEn: 'Wave, peace, fist, or a held open palm, and the frog reacts.',
    description:
      '摄像头识别挥手、剪刀手、握拳和按住的张开手掌，奶蛙会单臂挥手、跳跃或惊讶。也可按 1-4。',
    accent: '#ffe14a',
    accent2: '#fff3d2',
  },
  {
    slug: 'me',
    route: '/me/',
    titleZh: '手势互动',
    titleEn: 'Real Gesture',
    pageTitle: '手势互动 · 真人版',
    blurbZh: '挥手、比耶、握拳或按住张掌，真人会回应。',
    blurbEn: 'Wave, peace, fist, or a held open palm, and he reacts.',
    description:
      '摄像头识别挥手、剪刀手、握拳和按住的张开手掌，真人会挥手、跳跃或惊讶。也可按 1-4。',
    accent: '#d5deee',
    accent2: '#7f9bb8',
  },
] as const;

export function sceneBySlug(slug: string): SceneInfo | undefined {
  return scenes.find((scene) => scene.slug === slug);
}

export function joinBase(base: string, route: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return normalizedBase + route.replace(/^\//, '');
}
