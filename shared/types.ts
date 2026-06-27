export type ElementKey = "metal" | "wood" | "water" | "fire" | "earth" | "none";

export type TechniqueStage = 0 | 1 | 2 | 3;

export type Quality = "white" | "green" | "blue" | "purple" | "orange";

export type EquipmentSlot = "weapon" | "robe" | "crown" | "boots" | "ring" | "amulet";

export interface Attributes {
  attack: number;
  defense: number;
  health: number;
  speed: number;
  critRate: number;
  evasionRate: number;
  tenacity: number;
  accuracy: number;
  damageBonus: number;
}

export interface RealmDefinition {
  id: string;
  name: string;
  major: string;
  phase: string;
  order: number;
  cultivationCap: number;
  baseAttributes: Attributes;
  specialDodgePoints?: number;
}

export interface TechniqueDefinition {
  id: string;
  name: string;
  school: "dao" | "buddha" | "self";
  element: ElementKey;
  description: string;
  bonuses: Partial<Attributes> & {
    attackPct?: number;
    defensePct?: number;
    healthPct?: number;
    cultivationSpeedPct?: number;
  };
  upgradeBattleExp: number[];
  upgradeSpiritStones: number[];
}

export interface LearnedTechnique {
  id: string;
  stage: TechniqueStage;
  level: number;
  perfectedAt?: number;
}

export interface EquipmentItem {
  id: string;
  kind: "equipment";
  name: string;
  slot: EquipmentSlot;
  quality: Quality;
  realmOrderRequired: number;
  attributes: Partial<Attributes>;
  enhanceLevel: number;
  locked: boolean;
}

export interface ConsumableItem {
  id: string;
  kind: "consumable";
  code: "protect_pill" | "rebirth_stone" | "offline_makeup_card" | "iron";
  name: string;
  quantity: number;
  locked: boolean;
}

export type InventoryItem = EquipmentItem | ConsumableItem;

export interface ArtifactState {
  id: string;
  name: string;
  fragments: number;
  stars: number;
  active: boolean;
}

export interface MailItem {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  expiresAt: number;
  claimed: boolean;
  rewards: RewardBundle;
}

export interface RewardBundle {
  cultivation?: number;
  battleExp?: number;
  spiritStones?: number;
  reputation?: number;
  items?: InventoryItem[];
  artifactFragments?: { id: string; amount: number }[];
}

export interface PlayerState {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  name: string;
  realmIndex: number;
  cultivation: number;
  battleExp: number;
  spiritStones: number;
  reputation: number;
  lifePoints: number;
  maxLifePoints: number;
  cultivating: boolean;
  breakthroughCooldownUntil: number;
  talents: {
    cultivation: number;
    combat: number;
    fortune: number;
  };
  spiritualRoot: ElementKey;
  learnedTechniques: LearnedTechnique[];
  activeTechniqueId?: string;
  inventory: InventoryItem[];
  equipped: Partial<Record<EquipmentSlot, string>>;
  artifacts: ArtifactState[];
  trialTower: {
    highestFloor: number;
    failedCooldownUntil: number;
    lastSweepDate?: string;
  };
  arena: {
    rank?: number;
    freeChallengesRemaining: number;
    paidChallengesBought: number;
    lastResetDate: string;
  };
  spiritVein: {
    highestLayer: number;
    failedCooldownUntil: number;
    stationed: boolean;
    essence: number;
  };
  guide: {
    completedSteps: string[];
    starterPackClaimed: boolean;
  };
  daily: {
    lastLoginRewardDate?: string;
  };
  settings: {
    soundEnabled: boolean;
  };
  mail: MailItem[];
  log: string[];
}

export interface Combatant {
  name: string;
  attributes: Attributes;
}

export interface BattleRound {
  actor: string;
  target: string;
  damage: number;
  crit: boolean;
  dodged: boolean;
  targetHp: number;
}

export interface BattleResult {
  won: boolean;
  rounds: BattleRound[];
  playerRemainingHp: number;
  enemyRemainingHp: number;
}

export interface MainTask {
  id: string;
  title: string;
  complete: boolean;
  claimed: boolean;
  rewards: RewardBundle;
}

export interface ArenaOpponent {
  id: string;
  name: string;
  rank: number;
  power: number;
  attributes: Attributes;
}

export interface PublicGameState {
  now: number;
  player: PlayerState;
  realm: RealmDefinition;
  nextRealm?: RealmDefinition;
  attributes: Attributes;
  power: number;
  cultivationPerSecond: number;
  battleExpCap: number;
  guideStep?: GuideStep;
  mainTasks: MainTask[];
  arenaOpponents: ArenaOpponent[];
  lastBattle?: BattleResult;
}

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  targetTab: AppTab;
  primaryAction?: GameAction;
}

export type AppTab = "cave" | "library" | "tower" | "arena" | "bag" | "more";

export type GameAction =
  | { type: "startCultivation" }
  | { type: "buyProtectPill" }
  | { type: "breakthrough"; useProtectPill: boolean }
  | { type: "recoverLife" }
  | { type: "resetTalent" }
  | { type: "learnTechnique"; techniqueId: string }
  | { type: "upgradeTechnique"; techniqueId: string }
  | { type: "challengeTrialTower" }
  | { type: "sweepTrialTower" }
  | { type: "challengeArena"; opponentId: string }
  | { type: "buyArenaChallenge" }
  | { type: "challengeSpiritVein" }
  | { type: "stationSpiritVein" }
  | { type: "claimDailyLogin" }
  | { type: "claimStarterPack" }
  | { type: "equipItem"; itemId: string }
  | { type: "toggleItemLock"; itemId: string }
  | { type: "sellLowQualityEquipment" }
  | { type: "enhanceEquipped"; slot: EquipmentSlot }
  | { type: "combineArtifact"; artifactId: string }
  | { type: "toggleSound" }
  | { type: "logout" };
