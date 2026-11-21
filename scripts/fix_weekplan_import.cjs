const fs = require('fs');
const p = 'src/CoachScreen.tsx';
let c = fs.readFileSync(p, 'utf8');
if (!c.includes("import type { WeekPlan }")) {
  c = c.replace(
    "  reserveStudents, rosterSorted, runWeeklyContest, seasonReport, setSquad, setTeam, stageOfWeek, overallScoreOf, teamStudents,\n} from './season.ts';",
    "  reserveStudents, rosterSorted, runWeeklyContest, seasonReport, setSquad, setTeam, stageOfWeek, overallScoreOf, teamStudents,\n} from './season.ts';\nimport type { WeekPlan } from './season.ts';"
  );
}
fs.writeFileSync(p, c, 'utf8');
console.log('ok', c.includes("import type { WeekPlan } from './season.ts';"));
