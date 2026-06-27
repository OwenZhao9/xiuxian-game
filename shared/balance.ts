import type {
  Attributes,
  ElementKey,
  EquipmentSlot,
  Quality,
  RealmDefinition,
  TechniqueDefinition,
} from "./types.js";

const ZERO_RATES = {
  critRate: 0,
  evasionRate: 0,
  tenacity: 0,
  accuracy: 100,
  damageBonus: 0,
};

const MAJOR_REALMS = ["练气", "筑基", "结丹", "元婴", "化神", "炼虚", "合体", "大乘"];
const PHASES = ["前期", "中期", "后期", "大圆满"];

export const REALMS: RealmDefinition[] = MAJOR_REALMS.flatMap((major, majorIndex) =>
  PHASES.map((phase, phaseIndex) => {
    const order = majorIndex * PHASES.length + phaseIndex;
    const cultivationCap = Math.floor(12 * Math.pow(1.74, order));
    const baseAttributes: Attributes = {
      attack: Math.floor(10 * Math.pow(1.23, order)),
      defense: Math.floor(6 * Math.pow(1.22, order)),
      health: Math.floor(120 * Math.pow(1.26, order)),
      speed: 100 + order * 2,
      ...ZERO_RATES,
    };

    return {
      id: `mortal-${majorIndex}-${phaseIndex}`,
      name: `凡境·${major}${phase}`,
      major,
      phase,
      order,
      cultivationCap,
      baseAttributes,
      specialDodgePoints: major === "练气" && phase === "大圆满" ? 800 : undefined,
    };
  }),
);

export const FIRST_PHASE_MAX_REALM_INDEX = REALMS.length - 1;

export const QUALITY_LABEL: Record<Quality, string> = {
  white: "白",
  green: "绿",
  blue: "蓝",
  purple: "紫",
  orange: "橙",
};

export const QUALITY_MULTIPLIER: Record<Quality, number> = {
  white: 1,
  green: 1.35,
  blue: 1.8,
  purple: 2.45,
  orange: 3.3,
};

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon", "robe", "crown", "boots", "ring", "amulet"];

export const SLOT_LABEL: Record<EquipmentSlot, string> = {
  weapon: "法器",
  robe: "道袍",
  crown: "冠",
  boots: "履",
  ring: "戒",
  amulet: "佩",
};

export const ELEMENT_LABEL: Record<ElementKey, string> = {
  metal: "金",
  wood: "木",
  water: "水",
  fire: "火",
  earth: "土",
  none: "无",
};

export const ELEMENT_COUNTERS: Record<ElementKey, ElementKey> = {
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal",
  none: "none",
};

export const TECHNIQUE_STAGE_LABELS = ["入门", "精通", "大成", "圆满"] as const;

export const TECHNIQUES: TechniqueDefinition[] = [
  {
    id: "breath-of-dao",
    name: "吐纳诀",
    school: "dao",
    element: "wood",
    description: "道法书店基础功法，提升修炼速度与少量攻击。",
    bonuses: { cultivationSpeedPct: 0.08, attackPct: 0.03 },
    upgradeBattleExp: [30, 90, 180],
    upgradeSpiritStones: [0, 20, 50],
  },
  {
    id: "vajra-body",
    name: "金刚经",
    school: "buddha",
    element: "metal",
    description: "佛法书店基础功法，提升生命与防御。",
    bonuses: { healthPct: 0.06, defensePct: 0.04 },
    upgradeBattleExp: [35, 100, 220],
    upgradeSpiritStones: [0, 25, 60],
  },
  {
    id: "flame-heart",
    name: "离火心诀",
    school: "dao",
    element: "fire",
    description: "战斗型功法，提升暴击与攻击。",
    bonuses: { attackPct: 0.06, critRate: 2 },
    upgradeBattleExp: [80, 180, 360],
    upgradeSpiritStones: [20, 60, 120],
  },
  {
    id: "still-water",
    name: "止水观",
    school: "buddha",
    element: "water",
    description: "防守型功法，提升闪避与韧性。",
    bonuses: { evasionRate: 2, tenacity: 2, healthPct: 0.03 },
    upgradeBattleExp: [75, 170, 340],
    upgradeSpiritStones: [20, 60, 120],
  },
  {
    id: "formless-origin",
    name: "无相神功",
    school: "self",
    element: "none",
    description: "五行圆满功法自创而成，拥有独立属性。",
    bonuses: { attackPct: 0.18, defensePct: 0.12, healthPct: 0.15, damageBonus: 8 },
    upgradeBattleExp: [500, 1200, 2600],
    upgradeSpiritStones: [500, 1200, 2600],
  },
];

export const ARTIFACTS = [
  {
    id: "taiji-jade",
    name: "太极玉璧",
    fragmentName: "太极玉璧碎片",
    attributes: { attack: 30, defense: 20, health: 300, damageBonus: 2 } satisfies Partial<Attributes>,
  },
  {
    id: "heaven-seal",
    name: "问天印",
    fragmentName: "问天印碎片",
    attributes: { attack: 55, critRate: 3 } satisfies Partial<Attributes>,
  },
];

export const PROTECT_PILL_COST = 80;
export const REBIRTH_STONE_COST = 120;
export const OFFLINE_MAKEUP_CARD_COST = 100;
export const BREAKTHROUGH_FAILURE_RATE = 0.3;
export const BREAKTHROUGH_COOLDOWN_MS = 30 * 60 * 1000;
export const TRIAL_FAIL_COOLDOWN_MS = 60 * 1000;
export const VEIN_FAIL_COOLDOWN_MS = 5 * 60 * 1000;
export const MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;
export const ONLINE_GRACE_MS = 90 * 1000;
export const BASE_CULTIVATION_PER_SECOND = 1.8;
export const SPIRIT_VEIN_STONE_PER_LAYER_SECOND = 0.01;

export function getTechnique(id: string) {
  return TECHNIQUES.find((technique) => technique.id === id);
}
