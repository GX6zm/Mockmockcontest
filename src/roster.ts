// 由 scripts/merge-csp.mjs 自动生成，请勿手改
// 来源：校 OJ（oj.gxyzh.com）排行榜 LV2+ 54 人 + CSP-J/S 2023–2024 陕西获奖名单 + OIerDb 本校 30 人
// 其中 37 人有正赛数据（21 人来自 OIerDb，16 人来自 CSP 奖项），正赛占 80%；无正赛数据者按校 OJ 排名计算
export interface RosterEntry {
  name: string;
  lv: number;
  rp: number | null;
  ac: number | null;
  rank: number;
  /** 初始 rating，用于成长机制 */
  rating0: number;
  /** 真实姓名（有的话） */
  realName?: string;
  /** OIerDb 正赛数据（有的话） */
  oierdb?: { national: number; score: number; ccf: number; grade: string };
  /** CSP 最好成绩（没有 OIerDb 时才有） */
  csp?: { year: number; group: "j" | "s"; award: 1 | 2 | 3; score: number; school: string; rank?: number | null; total?: number | null };
}

export const ROSTER: RosterEntry[] = [
  { name: "周炜恒", lv: 8, rp: 302, ac: 1149, rank: 1, rating0: 1797, realName: "周炜恒", oierdb: { national: 3795, score: 6031.93, ccf: 7, grade: "高一" } },
  { name: "法克火星人", lv: 8, rp: 301, ac: 1117, rank: 2, rating0: 1797, realName: "陈泉林", oierdb: { national: 3455, score: 6339.53, ccf: 7, grade: "高二" } },
  { name: "丁一宸", lv: 8, rp: 300, ac: 1065, rank: 3, rating0: 1845, oierdb: { national: 943, score: 15118.48, ccf: 9, grade: "高二" } },
  { name: "傻白虎", lv: 7, rp: 299, ac: 1027, rank: 4, rating0: 1838, realName: "刘昱合", oierdb: { national: 1010, score: 14353.38, ccf: 9, grade: "高二" } },
  { name: "特别之处", lv: 7, rp: 299, ac: 996, rank: 6, rating0: 1878, realName: "吕明栩", oierdb: { national: 344, score: 29528.13, ccf: 7, grade: "初三" } },
  { name: "noitamotuA_珂", lv: 7, rp: 299, ac: 995, rank: 7, rating0: 1832, realName: "丁子博", oierdb: { national: 1085, score: 13683.1, ccf: 8, grade: "高一" } },
  { name: "为什么不让我叫Ciall", lv: 6, rp: 298, ac: 1003, rank: 8, rating0: 1800, csp: { year: 2025, group: "s", award: 1, score: 201, school: "", rank: 2481, total: 30497 } },
  { name: "王鼎翼", lv: 6, rp: 297, ac: 934, rank: 9, rating0: 1740, oierdb: { national: 9117, score: 3316.61, ccf: 6, grade: "高一" } },
  { name: "王思琦", lv: 6, rp: 297, ac: 1011, rank: 10, rating0: 1852, realName: "王思琦", oierdb: { national: 618, score: 20596.91, ccf: 7, grade: "高一" } },
  { name: "周逸然", lv: 6, rp: 296, ac: 964, rank: 11, rating0: 1783, realName: "周逸然", oierdb: { national: 2825, score: 7146.63, ccf: 7, grade: "高一" } },
  { name: "张培楠", lv: 6, rp: 296, ac: 946, rank: 12, rating0: 1752, realName: "张培楠", csp: { year: 2024, group: "s", award: 1, score: 130, school: "西安市高新一中初级中学" } },
  { name: "肖子卓", lv: 6, rp: 295, ac: 896, rank: 13, rating0: 1817, realName: "肖子卓", oierdb: { national: 1058, score: 13972.98, ccf: 7, grade: "初三" } },
  { name: "陈和骏", lv: 6, rp: 294, ac: 873, rank: 14, rating0: 1545 },
  { name: "Zctf一零八八", lv: 6, rp: 293, ac: 860, rank: 15, rating0: 1764, realName: "张顺凯", oierdb: { national: 3384, score: 6408.57, ccf: 7, grade: "高一" } },
  { name: "陈钰婉", lv: 5, rp: 293, ac: 861, rank: 16, rating0: 1748, realName: "陈钰婉", oierdb: { national: 5377, score: 4815.95, ccf: 6, grade: "高二" } },
  { name: "孙可轩", lv: 5, rp: 292, ac: 813, rank: 17, rating0: 1725, realName: "孙可轩", csp: { year: 2024, group: "s", award: 2, score: 120, school: "西安高新区第四初级中学" } },
  { name: "蔡青辰", lv: 5, rp: 290, ac: 794, rank: 18, rating0: 1684 },
  { name: "都大人的题构结据数做年常", lv: 5, rp: 289, ac: 776, rank: 19, rating0: 1749, realName: "柏鹭鸣", oierdb: { national: 4107, score: 5755.88, ccf: 7, grade: "高二" } },
  { name: "zch_stl大变", lv: 5, rp: 288, ac: 721, rank: 20, rating0: 1725, realName: "张宸华", oierdb: { national: 6837, score: 4105.99, ccf: 6, grade: "高一" } },
  { name: "不见了，失败了。", lv: 5, rp: 287, ac: 736, rank: 21, rating0: 1722, realName: "禹奕成", oierdb: { national: 7090, score: 4006.12, ccf: 6, grade: "高二" } },
  { name: "赵绎哲", lv: 5, rp: 287, ac: 730, rank: 22, rating0: 1744, realName: "赵绎哲", csp: { year: 2024, group: "s", award: 1, score: 160, school: "西安高新一中实验中学" } },
  { name: "周檬轩", lv: 5, rp: 286, ac: 705, rank: 23, rating0: 1704, oierdb: { national: 9370, score: 3246.47, ccf: 7, grade: "初三" } },
  { name: "李君泽", lv: 4, rp: 286, ac: 689, rank: 24, rating0: 1682, realName: "李君泽", oierdb: { national: 14419, score: 2260.78, ccf: 5, grade: "初三" } },
  { name: "杨昕然", lv: 4, rp: 283, ac: 648, rank: 25, rating0: 1558 },
  { name: "张正轩", lv: 4, rp: 282, ac: 631, rank: 26, rating0: 1633, realName: "张正轩", csp: { year: 2024, group: "j", award: 1, score: 260, school: "西安高新区实验小学" } },
  { name: "张爱熙", lv: 4, rp: 282, ac: 617, rank: 27, rating0: 1569 },
  { name: "张博一", lv: 4, rp: 281, ac: 601, rank: 28, rating0: 1434 },
  { name: "陈怡嘉", lv: 4, rp: 280, ac: 568, rank: 29, rating0: 1708, realName: "陈怡嘉", oierdb: { national: 5674, score: 4657.26, ccf: 6, grade: "高一" } },
  { name: "刘子牧", lv: 4, rp: 280, ac: 594, rank: 30, rating0: 1535 },
  { name: "陈逸阳", lv: 4, rp: 278, ac: 523, rank: 31, rating0: 1717, realName: "陈逸阳", oierdb: { national: 3934, score: 5911.99, ccf: 7, grade: "高一" } },
  { name: "霍秋实", lv: 3, rp: 278, ac: 558, rank: 32, rating0: 1497 },
  { name: "李金潼", lv: 3, rp: 276, ac: 513, rank: 33, rating0: 1689, realName: "李金潼", oierdb: { national: 7441, score: 3874.22, ccf: 6, grade: "初三" } },
  { name: "吴禹泽", lv: 3, rp: 274, ac: 499, rank: 34, rating0: 1467 },
  { name: "苗淇", lv: 3, rp: 274, ac: 485, rank: 35, rating0: 1679, realName: "苗淇", oierdb: { national: 8040, score: 3653.89, ccf: 7, grade: "初三" } },
  { name: "翟煜泽", lv: 3, rp: 273, ac: 497, rank: 36, rating0: 1640, csp: { year: 2024, group: "s", award: 2, score: 100, school: "西安市高新第二初级中学" } },
  { name: "石丰源", lv: 3, rp: 273, ac: 498, rank: 37, rating0: 1430 },
  { name: "刘尚泽坤", lv: 3, rp: 272, ac: 480, rank: 38, rating0: 1554, csp: { year: 2024, group: "j", award: 2, score: 190, school: "西安高新区第三初级中学" } },
  { name: "陶锐轩", lv: 3, rp: 271, ac: 461, rank: 39, rating0: 1404 },
  { name: "罗崇艺", lv: 3, rp: 270, ac: 431, rank: 40, rating0: 1664, csp: { year: 2024, group: "s", award: 2, score: 120, school: "西安高新区第十一初级中学" } },
  { name: "韩亦书", lv: 3, rp: 268, ac: 429, rank: 41, rating0: 1378 },
  { name: "赵泽瑄", lv: 3, rp: 268, ac: 399, rank: 42, rating0: 1568, csp: { year: 2023, group: "j", award: 1, score: 105, school: "西安高新第二小学" } },
  { name: "刘益铭", lv: 3, rp: 268, ac: 405, rank: 43, rating0: 1615, realName: "刘益铭", csp: { year: 2024, group: "s", award: 2, score: 75, school: "西安高新第一小学" } },
  { name: "贺思杰", lv: 2, rp: 267, ac: 407, rank: 44, rating0: 1490, realName: "贺思杰", csp: { year: 2024, group: "j", award: 2, score: 100, school: "西安高新区第十七小学" } },
  { name: "王穆迪", lv: 2, rp: 267, ac: 404, rank: 45, rating0: 1331 },
  { name: "张家康", lv: 2, rp: 266, ac: 392, rank: 46, rating0: 1301 },
  { name: "孙宇安", lv: 2, rp: 264, ac: 360, rank: 47, rating0: 1611, realName: "孙宇安", csp: { year: 2024, group: "s", award: 2, score: 100, school: "西安高新区第三初级中学" } },
  { name: "MLE自动机", lv: 2, rp: 263, ac: 362, rank: 48, rating0: 1608, realName: "赵凌奇", csp: { year: 2024, group: "s", award: 2, score: 100, school: "西安高新东区小学" } },
  { name: "王岚清", lv: 2, rp: 263, ac: 352, rank: 49, rating0: 1655, csp: { year: 2024, group: "s", award: 1, score: 140, school: "西安高新一中实验中学" } },
  { name: "陈霖锐", lv: 2, rp: 263, ac: 353, rank: 50, rating0: 1476, realName: "陈霖锐", csp: { year: 2024, group: "j", award: 2, score: 100, school: "西安高新东区小学" } },
  { name: "刘郑邦", lv: 2, rp: 260, ac: 321, rank: 51, rating0: 1247 },
  { name: "职业失踪人员", lv: 2, rp: 259, ac: 334, rank: 52, rating0: 1242, realName: "丁婉馨" },
  { name: "代羽辰", lv: 2, rp: 258, ac: 318, rank: 53, rating0: 1466, csp: { year: 2024, group: "j", award: 2, score: 100, school: "西安高新区第三初级中学" } },
  { name: "李嘉柠", lv: 2, rp: 250, ac: 248, rank: 54, rating0: 1213 },
  { name: "樊一靓", lv: 2, rp: 238, ac: 187, rank: 55, rating0: 1200 },
];
