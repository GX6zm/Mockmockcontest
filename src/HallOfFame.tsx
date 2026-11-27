/**
 * 校史荣誉墙 & 选手长期档案中心
 *
 * 4 个 Tab：
 *  1) 奖杯柜与校史：累计奖牌、历年战绩、声望与经费；
 *  2) 名人堂：按生涯荣誉权重排名的在校/毕业传奇，点击可展开完整跨学年履历；
 *  3) 毕业生去向录：按届别归档所有高三毕业生去向与返校讲课专长；
 *  4) 机房奇闻纪录榜：跨学年 6 项校史之最（最高综合/最高得分率/最惨挂分王/最大反挂王/暴涨黑马/铁人）。
 */
import { useState } from 'react';
import { ACHIEVEMENTS, loadAchievements } from './achievements.ts';
import { TOPIC_NAMES } from './game.ts';
import {
  GRADE_NAMES, budgetOf, honorScoreOf, recordsOf, seasonReport, suspendQuotaOf,
} from './season.ts';
import type { SeasonState, StudentArchive } from './season.ts';
import { Ic } from './ui.tsx';

type Tab = 'overview' | 'legends' | 'alumni' | 'records' | 'achievements';

export function HallOfFame({ season, onClose }: { season: SeasonState; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [expanded, setExpanded] = useState<string | null>(null);

  const rep = seasonReport(season);
  const t = rep.totals;
  const allArchives = Object.values(season.archives ?? {});
  const legends = allArchives
    .slice()
    .sort((a, b) => honorScoreOf(b) - honorScoreOf(a) || b.peakOverall - a.peakOverall)
    .slice(0, 30);

  const alumniByYear = new Map<number, StudentArchive[]>();
  for (const a of allArchives) {
    if (a.graduatedYear === null) continue;
    const list = alumniByYear.get(a.graduatedYear) ?? [];
    list.push(a);
    alumniByYear.set(a.graduatedYear, list);
  }
  const gradYears = [...alumniByYear.keys()].sort((a, b) => b - a);
  const rec = recordsOf(season);
  const achStore = loadAchievements();
  const achCount = ACHIEVEMENTS.filter((a) => Boolean(achStore.unlocked[a.id])).length;

  const rivalStats = new Map<string, { school: string; isLocal: boolean; played: number; wins: number }>();
  for (const c of season.contests) {
    for (const rv of c.rivals ?? []) {
      const cur = rivalStats.get(rv.school) ?? { school: rv.school, isLocal: rv.isLocal, played: 0, wins: 0 };
      cur.played += 1;
      if (rv.beaten) cur.wins += 1;
      rivalStats.set(rv.school, cur);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
      onClick={onClose}
      data-testid="hall-of-fame-modal"
    >
      <div
        className="w-full max-w-5xl h-[84vh] ui-panel border border-white/15 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0d121b]">
          <div className="flex items-center gap-2">
            <Ic n="trophy" size={16} />
            <h2 className="text-[15px] font-black text-white">校史荣誉墙 · 档案中心</h2>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-2">
            {([
              ['overview', '奖杯柜与校史'],
              ['legends', `名人堂 (${legends.length})`],
              ['alumni', `毕业生去向 (${allArchives.filter((a) => a.graduatedYear !== null).length})`],
              ['records', '机房奇闻纪录'],
              ['achievements', `永久成就 (${achCount}/${ACHIEVEMENTS.length})`],
            ] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                data-testid={`hof-tab-${k}`}
                className={`ui-pill ${tab === k ? 'ui-pill-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            data-testid="hof-close"
            className="ml-auto ui-btn-ghost px-2.5 py-1 text-[12px]"
          >
            <Ic n="x" size={14} /> 关闭
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
                <TrophyBox label="IOI 奖牌" value={t.ioiGold + t.ioiSilver + t.ioiBronze} sub={`金 ${t.ioiGold} · 银 ${t.ioiSilver} · 铜 ${t.ioiBronze}`} tone="text-cyan-300" />
                <TrophyBox label="NOI 奖牌" value={t.noiGold + t.noiSilver + t.noiBronze} sub={`金 ${t.noiGold} · 银 ${t.noiSilver} · 铜 ${t.noiBronze}`} tone="text-emerald-300" />
                <TrophyBox label="省队人数" value={t.provTeam} sub={`国集保送 ${t.noiSelected} 人`} tone="text-rose-300" />
                <TrophyBox label="省一（S/NOIP）" value={t.csp2First + t.noipFirst} sub={`S ${t.csp2First} · NOIP ${t.noipFirst}`} tone="text-amber-300" />
                <TrophyBox label="WC / APIO 牌" value={t.wcGold + t.wcSilver + t.wcBronze + t.apioGold + t.apioSilver + t.apioBronze} sub={`金 ${t.wcGold + t.apioGold} · 银 ${t.wcSilver + t.apioSilver}`} tone="text-sky-300" />
                <TrophyBox label="校队当前资源" value={`经费 ${budgetOf(season)}`} sub={`声望 ${Math.round(season.prestige)} · 停课 ${suspendQuotaOf(season)}周`} tone="text-white" />
              </div>

              <div className="ui-panel p-4">
                <div className="text-[12px] font-bold text-slate-200 mb-2">历年战绩总览（含本学年进度）</div>
                <table className="w-full text-[12px]">
                  <thead className="ui-table-head">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">学年</th>
                      <th className="text-right px-2 py-1.5 font-medium">初赛过线</th>
                      <th className="text-right px-2 py-1.5 font-medium">S 省一</th>
                      <th className="text-right px-2 py-1.5 font-medium">NOIP 省一</th>
                      <th className="text-right px-2 py-1.5 font-medium">省队</th>
                      <th className="text-right px-2 py-1.5 font-medium">NOI 金/银/铜</th>
                      <th className="text-right px-2 py-1.5 font-medium">IOI 牌</th>
                      <th className="text-right px-2 py-1.5 font-medium">主力均涨</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.years.map((y) => (
                      <tr key={y.year} className="border-t border-white/[0.06]">
                        <td className="px-2 py-1.5 text-slate-100 font-bold">第 {y.year} 学年</td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-300">{y.csp1Pass}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-amber-300">{y.csp2First}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-amber-300">{y.noipFirst}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-rose-300">{y.provTeam}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-emerald-300">{y.noiGold}/{y.noiSilver}/{y.noiBronze}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-cyan-300">{y.ioiGold + y.ioiSilver + y.ioiBronze || '—'}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-sky-300">+{Math.max(0, y.avgOverallGain).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rivalStats.size > 0 && (
                <div className="ui-panel p-4">
                  <div className="text-[12px] font-bold text-slate-200 mb-2">本学年宿敌名校交手记录</div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {[...rivalStats.values()].map((rv) => (
                      <div key={rv.school} className="border border-white/[0.08] bg-white/[0.02] p-2.5 text-[11.5px]">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-100">{rv.school}</span>
                          <span className="text-[10px] text-slate-400">{rv.isLocal ? '本省宿敌' : '全国强校'}</span>
                        </div>
                        <div className="mt-1 font-mono text-[12px]">
                          胜负：<b className="text-emerald-300">{rv.wins} 胜</b> / <span className="text-slate-300">{rv.played - rv.wins} 负</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'legends' && (
            <div className="ui-panel p-4">
              <div className="text-[11.5px] text-slate-400 mb-2">
                按生涯综合荣誉排序（包含在校生与已毕业学长）；点行展开全部跨学年正赛履历
              </div>
              {legends.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-slate-400">暂无选手档案记录</div>
              ) : (
                <div className="space-y-1.5">
                  {legends.map((a, idx) => {
                    const open = expanded === a.name;
                    const noiTotal = a.noiGold + a.noiSilver + a.noiBronze;
                    return (
                      <div key={a.name} className="border border-white/[0.08] bg-white/[0.02]">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : a.name)}
                          className="w-full px-3 py-2 flex flex-wrap items-center gap-2 text-left text-[12px] hover:bg-white/[0.04]"
                        >
                          <span className="w-6 font-mono text-slate-400">#{idx + 1}</span>
                          <span className="font-bold text-slate-100">{a.name}</span>
                          <span className="text-[10.5px] px-1.5 py-0.5 border border-white/10 text-slate-300">
                            {a.graduatedYear !== null ? `Y${a.graduatedYear} 届毕业` : `在校 · ${GRADE_NAMES[a.maxGrade]}`}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            峰值 <b className="font-mono text-slate-200">{a.peakOverall.toFixed(1)}</b> · 专长 {TOPIC_NAMES[a.bestTopic]}
                          </span>
                          <div className="ml-auto flex flex-wrap gap-1.5 text-[10.5px]">
                            {a.ioiMedals > 0 && <span className="px-1.5 py-0.5 border border-cyan-400/40 bg-cyan-500/15 text-cyan-200">IOI ×{a.ioiMedals}</span>}
                            {a.noiGold > 0 && <span className="px-1.5 py-0.5 border border-amber-400/40 bg-amber-500/15 text-amber-200">NOI金 ×{a.noiGold}</span>}
                            {noiTotal > a.noiGold && <span className="px-1.5 py-0.5 border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">NOI银铜 ×{noiTotal - a.noiGold}</span>}
                            {a.provTeams > 0 && <span className="px-1.5 py-0.5 border border-rose-400/40 bg-rose-500/15 text-rose-200">省队 ×{a.provTeams}</span>}
                            {a.provFirsts > 0 && <span className="px-1.5 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-300">省一 ×{a.provFirsts}</span>}
                          </div>
                        </button>
                        {open && (
                          <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] bg-black/25 space-y-1.5 text-[11.5px]">
                            {a.destination && (
                              <div className="text-emerald-300">毕业去向：{a.destination}</div>
                            )}
                            {a.honors.length === 0 ? (
                              <div className="text-slate-400">尚未在正式比赛留下成绩记录。</div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {a.honors.map((h, hi) => (
                                  <span key={hi} className="text-[11px] px-2 py-0.5 border border-white/10 bg-white/[0.03] text-slate-200">
                                    Y{h.year}（{GRADE_NAMES[h.grade]}）{h.stageShort} · {h.score}分 #{h.rank} · {h.award}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'alumni' && (
            <div className="space-y-3">
              {gradYears.length === 0 ? (
                <div className="ui-panel p-8 text-center text-[12px] text-slate-400">
                  还没有毕业生离队。每学年末选择「继续带队」后，高三队员的毕业去向会自动归档到这里，并可受邀返校讲课。
                </div>
              ) : (
                gradYears.map((yr) => (
                  <div key={yr} className="ui-panel p-4">
                    <div className="text-[12.5px] font-bold text-white mb-2">第 {yr} 学年毕业届</div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {(alumniByYear.get(yr) ?? [])
                        .slice()
                        .sort((a, b) => honorScoreOf(b) - honorScoreOf(a))
                        .map((a) => (
                          <div key={a.name} className="border border-white/[0.08] bg-white/[0.02] p-2.5 text-[11.5px]">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-100">{a.name}</span>
                              <span className="text-[10.5px] text-slate-400">峰值 {a.peakOverall.toFixed(1)} · 专长 {TOPIC_NAMES[a.bestTopic]}</span>
                              <span className="ml-auto text-[10px] px-1.5 py-0.5 border border-amber-500/35 bg-amber-500/10 text-amber-200">
                                可邀返校讲课
                              </span>
                            </div>
                            <div className="mt-1 text-emerald-300/95">{a.destination ?? '毕业离队'}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'records' && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <RecordCard title="历史最高综合" icon="sparkles" rec={rec.highestOverall} unit="分" tone="text-amber-300" />
              <RecordCard title="正赛最高得分率" icon="award" rec={rec.highestOfficialRatio} unit="%" tone="text-emerald-300" />
              <RecordCard title="单场最惨挂分王" icon="alert" rec={rec.worstDrop} unit="分" tone="text-rose-300" />
              <RecordCard title="单场最大反挂王" icon="trendUp" rec={rec.bestGain} unit="分" tone="text-cyan-300" />
              <RecordCard title="单年综合暴涨黑马" icon="rocket" rec={rec.fastestGrowth} unit="+" tone="text-sky-300" />
              <RecordCard title="正赛出场王铁人" icon="flag" rec={rec.mostOfficialContests} unit="场" tone="text-violet-300" />
            </div>
          )}

          {tab === 'achievements' && (
            <div className="space-y-3">
              <div className="text-[11.5px] text-slate-400">
                跨周目永久保存在本机浏览器（已达成 {achCount}/{ACHIEVEMENTS.length}），重开「新的一届」或挑战特殊剧本也可累积点亮。
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {ACHIEVEMENTS.map((a) => {
                  const unlocked = Boolean(achStore.unlocked[a.id]);
                  const tierLabel = a.tier === 'gold' ? '金章' : a.tier === 'silver' ? '银章' : '铜章';
                  const tierCls = a.tier === 'gold'
                    ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                    : a.tier === 'silver'
                      ? 'border-slate-300/35 bg-slate-400/10 text-slate-200'
                      : 'border-orange-500/35 bg-orange-500/10 text-orange-200';
                  return (
                    <div
                      key={a.id}
                      className={`p-3 border transition-colors ${unlocked ? 'ui-tile-active' : 'border-white/[0.08] bg-white/[0.01] opacity-60'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Ic n={a.icon} size={15} className={unlocked ? 'text-amber-300' : 'text-slate-500'} />
                        <span className="font-bold text-[12.5px] text-slate-100">{a.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 border ${tierCls}`}>{tierLabel}</span>
                        <span className={`ml-auto text-[10.5px] font-bold ${unlocked ? 'text-emerald-300' : 'text-slate-500'}`}>
                          {unlocked ? '已解锁' : '未解锁'}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[11.5px] text-slate-300 leading-snug">{a.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrophyBox({ label, value, sub, tone }: { label: string; value: number | string; sub: string; tone: string }) {
  return (
    <div className="ui-panel p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-xl font-black font-mono mt-0.5 ${tone}`}>{value}</div>
      <div className="text-[10.5px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function RecordCard({
  title, icon, rec, unit, tone,
}: {
  title: string;
  icon: 'sparkles' | 'award' | 'alert' | 'trendUp' | 'rocket' | 'flag';
  rec?: { name: string; year: number; value: number; detail: string };
  unit: string;
  tone: string;
}) {
  return (
    <div className="ui-panel p-4">
      <div className="text-[11.5px] text-slate-400 flex items-center gap-1.5">
        <Ic n={icon} size={13} /> {title}
      </div>
      {rec ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-base font-bold text-white">{rec.name}</span>
            <span className={`ml-auto font-mono text-lg font-black ${tone}`}>
              {unit === '+' ? `+${rec.value}` : `${rec.value}${unit}`}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{rec.detail}</div>
        </>
      ) : (
        <div className="mt-3 text-[11.5px] text-slate-500">暂无纪录，等待后续比赛产生</div>
      )}
    </div>
  );
}
