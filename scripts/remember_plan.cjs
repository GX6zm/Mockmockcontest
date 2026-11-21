const fs = require('fs');

// 1) season.ts：把上一周的方案存下来
let s = fs.readFileSync('src/season.ts', 'utf8');
s = s.replace(
  '  plan: WeekPlan | null;\n  report: TrainingReport | null;',
  '  plan: WeekPlan | null;\n  /** 上一周实际排的方案（下一周默认沿用） */\n  lastPlan?: WeekPlan | null;\n  report: TrainingReport | null;'
);
s = s.replace(
  '  return {\n    ...s,\n    students,\n    plan,\n    report: { week: s.week, plan, lines },',
  '  return {\n    ...s,\n    students,\n    plan,\n    lastPlan: plan,\n    report: { week: s.week, plan, lines },'
);
fs.writeFileSync('src/season.ts', s, 'utf8');

// 2) CoachScreen.tsx：默认值取上一周
let c = fs.readFileSync('src/CoachScreen.tsx', 'utf8');
c = c.replace(
  "  const [topic, setTopic] = useState<Topic | null>(null);\n  const [intensity, setIntensity] = useState<WeekIntensity>('normal');\n  const [focus, setFocus] = useState<SquadFocus>('balanced');\n  const [mock, setMock] = useState<MockConfig>({ preset: 'normal', problemCount: 3, minutes: 180 });",
  "  const lastPlan = season.lastPlan ?? null;\n  const [topic, setTopic] = useState<Topic | null>(lastPlan?.topic ?? null);\n  const [intensity, setIntensity] = useState<WeekIntensity>(lastPlan?.intensity ?? 'normal');\n  const [focus, setFocus] = useState<SquadFocus>(lastPlan?.focus ?? 'balanced');\n  const [mock, setMock] = useState<MockConfig>(lastPlan?.mock ?? { preset: 'normal', problemCount: 3, minutes: 180 });"
);

// 3) 顶部加「沿用上周」快捷条
const anchor = `      {event && <EventCard ev={event} season={season} onPick={onEvent} />}`;
const bar = `      {lastPlan && !event && (() => {
        const t = lastPlan.topic;
        const changed = t !== topic || lastPlan.intensity !== intensity || lastPlan.focus !== focus;
        return (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 px-3 py-2" data-testid="last-plan">
            <span className="text-[11px] text-slate-300">
              <Ic n="pin" /> 上周：{t ? TOPIC_NAMES[t] : '休息'} · {INTENSITY_INFO[lastPlan.intensity].name}
              {!stage && lastPlan.mock ? \` · 模拟赛 \${MOCK_PRESETS[lastPlan.mock.preset].name} \${lastPlan.mock.problemCount} 题 \${lastPlan.mock.minutes} 分\` : ''}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => {
                setTopic(lastPlan.topic);
                setIntensity(lastPlan.intensity);
                if (lastPlan.focus) setFocus(lastPlan.focus);
                if (lastPlan.mock) setMock(lastPlan.mock);
              }}
              className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700/50"
            >
              {changed ? '恢复成上周' : '已沿用'}
            </button>
            <button
              onClick={() => onPlan(lastPlan)}
              data-testid="plan-same-as-last"
              className="rounded-md bg-slate-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-600"
            >
              一字不改，直接排
            </button>
          </div>
        );
      })()}

${anchor}`;
c = c.replace(anchor, bar);
fs.writeFileSync('src/CoachScreen.tsx', c, 'utf8');

console.log('season lastPlan:', s.includes('lastPlan: plan'));
console.log('coach init:', c.includes('lastPlan?.topic ?? null'));
console.log('bar:', c.includes('plan-same-as-last'));
