/**
 * 统一视觉原语 · OI SIM / SIGNAL
 *
 * 1) 全站只允许从这里取图形符号：Lucide 图标，界面禁止 emoji；
 * 2) 动效开关由生成 HTML 时写在 <html data-motion="..."> 上，运行时只读；
 * 3) plainText 负责把语录/彩蛋等数据文案里的表情符号清干净。
 *
 * 这个文件不依赖任何业务模块，season.ts 也可以只 import type，不产生运行时耦合。
 */
import type { ReactNode, SVGProps } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Award, BarChart3,
  BookOpen, Brain, CalendarDays, Check, ChevronRight, CircleDot, ClipboardList,
  Coffee, Cpu, Dices, Drama, Eye, FastForward, FileText, Flag, Flame, Frown,
  GraduationCap, Info, Layers, Lock, Medal, Meh, Mic, Pause, PenLine, Pin, Play,
  Plus, Radio, RefreshCw, Rocket, RotateCcw, Save, Scale, ScrollText, Settings,
  SkipForward, Smile, Sparkles, Sprout, Target, Timer, TrendingDown, TrendingUp,
  Trophy, Unlock, Users, X, Zap,
} from 'lucide-react';

/** 图标名 → Lucide 组件。键名短，JSX 里写起来干净。 */
export const ICONS = {
  zap: Zap,
  graduation: GraduationCap,
  rocket: Rocket,
  scroll: ScrollText,
  eye: Eye,
  brain: Brain,
  dices: Dices,
  settings: Settings,
  clipboard: ClipboardList,
  lock: Lock,
  unlock: Unlock,
  trophy: Trophy,
  medal: Medal,
  award: Award,
  trendDown: TrendingDown,
  trendUp: TrendingUp,
  target: Target,
  drama: Drama,
  pen: PenLine,
  refresh: RefreshCw,
  rotateCcw: RotateCcw,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  alert: AlertTriangle,
  chart: BarChart3,
  mic: Mic,
  radio: Radio,
  pause: Pause,
  play: Play,
  plus: Plus,
  fastForward: FastForward,
  skipForward: SkipForward,
  check: Check,
  x: X,
  scale: Scale,
  sprout: Sprout,
  smile: Smile,
  meh: Meh,
  frown: Frown,
  coffee: Coffee,
  book: BookOpen,
  flag: Flag,
  pin: Pin,
  calendar: CalendarDays,
  save: Save,
  flame: Flame,
  file: FileText,
  sparkles: Sparkles,
  cpu: Cpu,
  circleDot: CircleDot,
  chevronRight: ChevronRight,
  info: Info,
  users: Users,
  timer: Timer,
  layers: Layers,
} as const;

export type IconName = keyof typeof ICONS;

/** 单个 Lucide 图标。默认 14px，继承文字颜色，行内对齐。 */
export function Ic({
  n, size = 14, className = '', ...rest
}: { n: IconName; size?: number; className?: string } & SVGProps<SVGSVGElement>) {
  const Cmp = ICONS[n];
  return (
    <Cmp
      size={size}
      strokeWidth={2}
      className={`ui-ic ${className}`}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}

export type MotionMode = 'full' | 'static';
const MOTION_STORAGE_KEY = 'oi-sim-motion-v1';

/** 读取当前动效模式（优先 localStorage，其次 <html data-motion>） */
export function getMotionMode(): MotionMode {
  if (typeof document === 'undefined') return 'full';
  try {
    const saved = localStorage.getItem(MOTION_STORAGE_KEY);
    if (saved === 'static' || saved === 'full') return saved;
  } catch { /* ignore */ }
  return document.documentElement.dataset.motion === 'static' ? 'static' : 'full';
}

/** 实时切换满血 / 静帧动效并持久化，让单一 HTML 同时兼顾低配机与高配机 */
export function setMotionMode(mode: MotionMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.motion = mode;
  }
  try {
    localStorage.setItem(MOTION_STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

/** 应用启动时同步一次已保存的动效偏好 */
export function initMotionMode(): MotionMode {
  const mode = getMotionMode();
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.motion = mode;
  }
  return mode;
}

/**
 * 满血版开关。静帧模式下把 <html data-motion="static"> 打开，
 * 这里返回 false → 不撒纸屑、不跑任何 JS 驱动的视觉动效。
 */
export function motionFull(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion !== 'static';
}

/** 表情符号 / 装饰性图形（含变体选择符、肤色、ZWJ），用于兜底清洗。 */
const EMOJI_GRAPHICS = /[\p{Extended_Pictographic}\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/gu;
const EMOJI_MODIFIERS = /[\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/gu;

/**
 * 去掉界面文案里的表情符号。箭头（→ ↑ ↓ ）属于排版标点，不是 emoji，予以保留。
 * 用于语录、彩蛋等来自数据的自由文本。
 */
export function plainText(s: string): string {
  return s
    .replace(EMOJI_MODIFIERS, '')
    .replace(EMOJI_GRAPHICS, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** 带编号的小标签，实验性排版里的「章节索引」。 */
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ui-kicker ${className}`}>{children}</span>;
}
