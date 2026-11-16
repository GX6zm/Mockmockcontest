import { useState } from 'react';
import CoachScreen from './CoachScreen.tsx';
import OpvEditor from './OpvEditor.tsx';
import { clearCoachSeason, hasCoachSave } from './coachSave.ts';
import { clearOpvConfig, IS_OPV, saveOpvConfig } from './opv.ts';
import type { OpvConfig } from './opv.ts';

/**
 * 单场模拟赛（观战模式）已下线，整个应用只剩教练模式：
 * 开档 → 选队 → 按真实赛历打完整学年 → 升学 / 招新 → 下一届。
 */
export default function App() {
  const [opvOpen, setOpvOpen] = useState(false);

  const handleOpvSaved = (next: OpvConfig | null) => {
    if (next === null) clearOpvConfig();
    else saveOpvConfig(next);
    // 存档里的赛季已经生成过了，改配置必须从新的一届开始
    if (hasCoachSave()) {
      const ok = window.confirm(
        'OP 设置从「新的一届」开始生效。检测到已有教练存档，要清掉当前进度、马上按新设置重开吗？\n点「取消」会保留进度，设置留到下次开新的一届时生效。',
      );
      if (ok) clearCoachSeason();
    }
    setOpvOpen(false);
  };

  return (
    <>
      <CoachScreen onOpvSetup={() => setOpvOpen(true)} />
      {IS_OPV && opvOpen && (
        <OpvEditor onClose={() => setOpvOpen(false)} onSaved={handleOpvSaved} />
      )}
    </>
  );
}
