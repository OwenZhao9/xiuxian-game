import {
  ARTIFACTS,
  BASE_CULTIVATION_PER_SECOND,
  BREAKTHROUGH_COOLDOWN_MS,
  BREAKTHROUGH_FAILURE_RATE,
  ELEMENT_COUNTERS,
  EQUIPMENT_SLOTS,
  FIRST_PHASE_MAX_REALM_INDEX,
  MAX_OFFLINE_MS,
  ONLINE_GRACE_MS,
  PROTECT_PILL_COST,
  QUALITY_MULTIPLIER,
  REALMS,
  REBIRTH_STONE_COST,
  SLOT_LABEL,
  SPIRIT_VEIN_STONE_PER_LAYER_SECOND,
  TECHNIQUE_STAGE_LABELS,
  TECHNIQUES,
  TRIAL_FAIL_COOLDOWN_MS,
  VEIN_FAIL_COOLDOWN_MS,
  getTechnique,
} from "./balance.js";
import type {
  ArenaOpponent,
  Attributes,
  BattleResult,
  Combatant,
  ConsumableItem,
  ElementKey,
  EquipmentItem,
  EquipmentSlot,
  GameAction,
  GuideStep,
  InventoryItem,
  LearnedTechnique,
  MainTask,
  PlayerState,
  PublicGameState,
  Quality,
  RewardBundle,
} from "./types.js";

const ELEMENTS: ElementKey[] = ["metal", "wood", "water", "fire", "earth"];
const QUALITIES: Quality[] = ["white", "green", "blue", "purple", "orange"];
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

export function createPlayer(id: string, now: number): PlayerState {
  const root = randomElement(ELEMENTS);
  return {
    id,
    createdAt: now,
    lastSeenAt: now,
    name: "无名修士",
    realmIndex: 0,
    cultivation: 0,
    battleExp: 0,
    spiritStones: 0,
    reputation: 0,
    lifePoints: 3,
    maxLifePoints: 3,
    cultivating: false,
    breakthroughCooldownUntil: 0,
    talents: {
      cultivation: randomInt(1, 100),
      combat: randomInt(1, 100),
      fortune: randomInt(1, 100),
    },
    spiritualRoot: root,
    learnedTechniques: [],
    inventory: [
      {
        id: createId("item"),
        kind: "consumable",
        code: "rebirth_stone",
        name: "轮回石",
        quantity: 1,
        locked: false,
      },
    ],
    equipped: {},
    artifacts: ARTIFACTS.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      fragments: 0,
      stars: 0,
      active: false,
    })),
    trialTower: {
      highestFloor: 0,
      failedCooldownUntil: 0,
    },
    arena: {
      freeChallengesRemaining: 5,
      paidChallengesBought: 0,
      lastResetDate: dateKey(now),
    },
    spiritVein: {
      highestLayer: 0,
      failedCooldownUntil: 0,
      stationed: false,
      essence: 0,
    },
    guide: {
      completedSteps: [],
      starterPackClaimed: false,
    },
    daily: {},
    settings: {
      soundEnabled: true,
    },
    mail: [
      {
        id: createId("mail"),
        title: "入世礼",
        body: "洞府已开，静坐便可积累修为。",
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        claimed: true,
        rewards: {},
      },
    ],
    log: ["你在山门外醒来，体内灵根初现。"],
  };
}

export function applyTimeProgress(player: PlayerState, now: number): PlayerState {
  resetDailyCounters(player, now);

  if (now <= player.lastSeenAt) {
    return player;
  }

  const elapsedMs = Math.min(now - player.lastSeenAt, MAX_OFFLINE_MS);
  if (player.cultivating && elapsedMs > 0) {
    const onlineMs = Math.min(elapsedMs, ONLINE_GRACE_MS);
    const offlineMs = Math.max(0, elapsedMs - ONLINE_GRACE_MS);
    const rate = getCultivationPerSecond(player);
    const gained = rate * (onlineMs / 1000) + rate * 0.5 * (offlineMs / 1000);
    addCultivation(player, gained);

    if (offlineMs > 0) {
      pushLog(player, `离线挂机结算：获得修为 ${formatNumberZh(Math.floor(gained))}`);
    }
  }

  if (player.spiritVein.stationed && player.spiritVein.highestLayer > 0) {
    const gained = Math.floor(
      player.spiritVein.highestLayer * SPIRIT_VEIN_STONE_PER_LAYER_SECOND * (elapsedMs / 1000),
    );
    if (gained > 0) {
      player.spiritStones += gained;
    }
  }

  player.lastSeenAt = now;
  return player;
}

export function applyAction(
  player: PlayerState,
  action: GameAction,
  now: number,
): { player: PlayerState; lastBattle?: BattleResult } {
  applyTimeProgress(player, now);

  switch (action.type) {
    case "startCultivation":
      player.cultivating = true;
      if (!isGuideComplete(player, "start-cultivation")) {
        addReward(player, { cultivation: 8, spiritStones: PROTECT_PILL_COST });
        completeGuide(player, "start-cultivation");
        pushLog(player, "主线奖励：获得护脉丹所需灵石。");
      }
      pushLog(player, "开始打坐修炼，修为持续增长。");
      return { player };

    case "buyProtectPill":
      requireAmount(player.spiritStones, PROTECT_PILL_COST, "灵石不足，无法购买护脉丹。");
      player.spiritStones -= PROTECT_PILL_COST;
      addConsumable(player, "protect_pill", "护脉丹", 1);
      pushLog(player, "购得护脉丹，可使一次突破成功率提升至100%。");
      return { player };

    case "breakthrough":
      return { player: handleBreakthrough(player, action.useProtectPill, now) };

    case "recoverLife":
      player.lifePoints = player.maxLifePoints;
      pushLog(player, "回到洞府打坐，5秒后生命恢复。");
      return { player };

    case "resetTalent":
      consumeItem(player, "rebirth_stone", 1, "需要轮回石才能洗练天赋。");
      player.talents = {
        cultivation: Math.max(player.talents.cultivation, randomInt(1, 100)),
        combat: Math.max(player.talents.combat, randomInt(1, 100)),
        fortune: Math.max(player.talents.fortune, randomInt(1, 100)),
      };
      player.spiritualRoot = randomElement(ELEMENTS);
      pushLog(player, "轮回洗练完成，天赋数值保留历史最高值。");
      return { player };

    case "learnTechnique":
      return { player: learnTechnique(player, action.techniqueId) };

    case "upgradeTechnique":
      return { player: upgradeTechnique(player, action.techniqueId) };

    case "challengeTrialTower": {
      const lastBattle = challengeTrialTower(player, now);
      return { player, lastBattle };
    }

    case "sweepTrialTower":
      sweepTrialTower(player, now);
      return { player };

    case "challengeArena": {
      const lastBattle = challengeArena(player, action.opponentId, now);
      return { player, lastBattle };
    }

    case "buyArenaChallenge":
      buyArenaChallenge(player);
      return { player };

    case "challengeSpiritVein": {
      const lastBattle = challengeSpiritVein(player, now);
      return { player, lastBattle };
    }

    case "stationSpiritVein":
      if (player.spiritVein.highestLayer <= 0) {
        throw new GameRuleError("需要先通关至少一层灵脉。");
      }
      player.spiritVein.stationed = true;
      pushLog(player, `身外化身已驻守第 ${player.spiritVein.highestLayer} 层灵脉。`);
      return { player };

    case "claimDailyLogin":
      claimDailyLogin(player, now);
      return { player };

    case "claimStarterPack":
      claimStarterPack(player);
      return { player };

    case "equipItem":
      equipItem(player, action.itemId);
      return { player };

    case "toggleItemLock":
      toggleItemLock(player, action.itemId);
      return { player };

    case "sellLowQualityEquipment":
      sellLowQualityEquipment(player);
      return { player };

    case "enhanceEquipped":
      enhanceEquipped(player, action.slot);
      return { player };

    case "combineArtifact":
      combineArtifact(player, action.artifactId);
      return { player };

    case "toggleSound":
      player.settings.soundEnabled = !player.settings.soundEnabled;
      return { player };

    case "logout":
      return { player };

    default: {
      const exhaustive: never = action;
      throw new GameRuleError(`未知操作：${JSON.stringify(exhaustive)}`);
    }
  }
}

export function derivePublicState(
  player: PlayerState,
  now: number,
  lastBattle?: BattleResult,
): PublicGameState {
  const realm = REALMS[player.realmIndex];
  return {
    now,
    player,
    realm,
    nextRealm: REALMS[player.realmIndex + 1],
    attributes: calculateAttributes(player),
    power: calculatePower(calculateAttributes(player)),
    cultivationPerSecond: getCultivationPerSecond(player),
    battleExpCap: getBattleExpCap(player),
    guideStep: getGuideStep(player),
    mainTasks: getMainTasks(player),
    arenaOpponents: generateArenaOpponents(player),
    lastBattle,
  };
}

export function calculateAttributes(player: PlayerState): Attributes {
  const realm = REALMS[player.realmIndex];
  const attributes: Attributes = { ...realm.baseAttributes };
  const percent = { attack: 0, defense: 0, health: 0 };

  if (realm.specialDodgePoints) {
    attributes.evasionRate += realm.specialDodgePoints / 10;
  }

  for (const item of getEquippedItems(player)) {
    const enhanceMultiplier = 1 + item.enhanceLevel * 0.08;
    addAttributes(attributes, scaleAttributes(item.attributes, enhanceMultiplier));
  }

  for (const learned of player.learnedTechniques) {
    const definition = getTechnique(learned.id);
    if (!definition) continue;
    const stageMultiplier = learned.stage + 1;
    attributes.critRate += (definition.bonuses.critRate ?? 0) * stageMultiplier;
    attributes.evasionRate += (definition.bonuses.evasionRate ?? 0) * stageMultiplier;
    attributes.tenacity += (definition.bonuses.tenacity ?? 0) * stageMultiplier;
    attributes.damageBonus += (definition.bonuses.damageBonus ?? 0) * stageMultiplier;
    attributes.attack += (definition.bonuses.attack ?? 0) * stageMultiplier;
    attributes.defense += (definition.bonuses.defense ?? 0) * stageMultiplier;
    attributes.health += (definition.bonuses.health ?? 0) * stageMultiplier;
    percent.attack += (definition.bonuses.attackPct ?? 0) * stageMultiplier;
    percent.defense += (definition.bonuses.defensePct ?? 0) * stageMultiplier;
    percent.health += (definition.bonuses.healthPct ?? 0) * stageMultiplier;
  }

  applySetBonuses(player, attributes, percent);

  for (const owned of player.artifacts) {
    if (!owned.active || owned.stars <= 0) continue;
    const definition = ARTIFACTS.find((artifact) => artifact.id === owned.id);
    if (!definition) continue;
    const multiplier = owned.stars * (player.realmIndex > FIRST_PHASE_MAX_REALM_INDEX ? 2 : 1);
    addAttributes(attributes, scaleAttributes(definition.attributes, multiplier));
  }

  attributes.attack = Math.floor(attributes.attack * (1 + percent.attack));
  attributes.defense = Math.floor(attributes.defense * (1 + percent.defense));
  attributes.health = Math.floor(attributes.health * (1 + percent.health));
  attributes.speed = Math.floor(attributes.speed);
  attributes.critRate = clamp(Math.floor(attributes.critRate), 0, 80);
  attributes.evasionRate = clamp(Math.floor(attributes.evasionRate), 0, 80);
  attributes.tenacity = clamp(Math.floor(attributes.tenacity), 0, 100);
  attributes.accuracy = clamp(Math.floor(attributes.accuracy), 0, 100);
  attributes.damageBonus = Math.floor(attributes.damageBonus);

  return attributes;
}

export function calculatePower(attributes: Attributes): number {
  const base = attributes.attack * 5 + attributes.defense * 2.5 + attributes.health * 1.2;
  const critMultiplier = 1 + (attributes.critRate / 100) * 1.5;
  const damageMultiplier = 1 + attributes.damageBonus / 100;
  return Math.floor(base * critMultiplier * damageMultiplier);
}

export function getCultivationPerSecond(player: PlayerState): number {
  let multiplier = 1 + player.talents.cultivation / 100;

  for (const learned of player.learnedTechniques) {
    const definition = getTechnique(learned.id);
    if (!definition) continue;
    let bonus = definition.bonuses.cultivationSpeedPct ?? 0;
    if (definition.element === player.spiritualRoot) {
      bonus *= 1.3;
    }
    multiplier += bonus * (learned.stage + 1);
  }

  return round2(BASE_CULTIVATION_PER_SECOND * multiplier);
}

export function getBattleExpCap(player: PlayerState): number {
  return 500 + player.realmIndex * 140;
}

export function simulateBattle(player: Combatant, enemy: Combatant): BattleResult {
  let playerHp = player.attributes.health;
  let enemyHp = enemy.attributes.health;
  const rounds = [];
  const playerFirst = player.attributes.speed >= enemy.attributes.speed;
  let turn = 0;

  while (playerHp > 0 && enemyHp > 0 && rounds.length < 160) {
    const playerActs = turn % 2 === 0 ? playerFirst : !playerFirst;
    const actor = playerActs ? player : enemy;
    const target = playerActs ? enemy : player;
    const targetHp = playerActs ? enemyHp : playerHp;
    const hitChance = clamp(actor.attributes.accuracy - target.attributes.evasionRate, 20, 100);
    const dodged = Math.random() * 100 > hitChance;
    const critChance = clamp(actor.attributes.critRate - target.attributes.tenacity * 0.25, 0, 80);
    const crit = !dodged && Math.random() * 100 < critChance;
    const rawDamage = Math.max(1, actor.attributes.attack - target.attributes.defense * 0.45);
    const damage = dodged
      ? 0
      : Math.floor(rawDamage * (1 + actor.attributes.damageBonus / 100) * (crit ? 1.8 : 1));
    const nextHp = Math.max(0, targetHp - damage);

    if (playerActs) {
      enemyHp = nextHp;
    } else {
      playerHp = nextHp;
    }

    rounds.push({
      actor: actor.name,
      target: target.name,
      damage,
      crit,
      dodged,
      targetHp: nextHp,
    });
    turn += 1;
  }

  return {
    won: enemyHp <= 0 && playerHp > 0,
    rounds,
    playerRemainingHp: playerHp,
    enemyRemainingHp: enemyHp,
  };
}

export function formatNumberZh(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${trimDecimal(value / 1_000_000_000_000)}兆`;
  if (abs >= 100_000_000) return `${trimDecimal(value / 100_000_000)}亿`;
  if (abs >= 10_000) return `${trimDecimal(value / 10_000)}万`;
  return `${Math.floor(value)}`;
}

export function dateKey(now: number): string {
  return DATE_FORMAT.format(new Date(now));
}

function handleBreakthrough(player: PlayerState, useProtectPill: boolean, now: number): PlayerState {
  const realm = REALMS[player.realmIndex];
  if (!REALMS[player.realmIndex + 1]) {
    throw new GameRuleError("当前一期内容已到凡境·大乘大圆满。");
  }
  if (player.cultivation < realm.cultivationCap) {
    throw new GameRuleError("修为未满，不能突破。");
  }
  if (player.breakthroughCooldownUntil > now) {
    throw new GameRuleError("突破失败冷却中。");
  }

  if (useProtectPill) {
    consumeItem(player, "protect_pill", 1, "需要护脉丹才能确保突破成功。");
  }

  const success = useProtectPill || Math.random() >= BREAKTHROUGH_FAILURE_RATE;
  if (!success) {
    player.breakthroughCooldownUntil = now + BREAKTHROUGH_COOLDOWN_MS;
    pushLog(player, "突破失败，修为未损失，进入30分钟冷却。");
    return player;
  }

  player.realmIndex += 1;
  player.cultivation = 0;
  player.breakthroughCooldownUntil = 0;
  if (!isGuideComplete(player, "breakthrough")) {
    completeGuide(player, "breakthrough");
  }
  pushLog(player, `突破成功，晋升 ${REALMS[player.realmIndex].name}。`);
  return player;
}

function learnTechnique(player: PlayerState, techniqueId: string): PlayerState {
  const technique = getTechnique(techniqueId);
  if (!technique) throw new GameRuleError("功法不存在。");
  if (technique.school === "self") {
    throw new GameRuleError("无相神功只能通过自创合成获得。");
  }

  const existing = player.learnedTechniques.find((learned) => learned.id === techniqueId);
  if (existing) {
    player.reputation += 10;
    pushLog(player, "重复功法已自动分解为功法残卷。");
    return player;
  }

  player.learnedTechniques.push({ id: techniqueId, stage: 0, level: 1 });
  player.activeTechniqueId ||= techniqueId;
  if (!isGuideComplete(player, "learn-technique")) {
    completeGuide(player, "learn-technique");
    addReward(player, { battleExp: 40 });
  }
  pushLog(player, `习得功法《${technique.name}》。`);
  return player;
}

function upgradeTechnique(player: PlayerState, techniqueId: string): PlayerState {
  const learned = player.learnedTechniques.find((entry) => entry.id === techniqueId);
  if (!learned) throw new GameRuleError("尚未学习该功法。");
  if (learned.stage >= 3) throw new GameRuleError("该功法已圆满。");

  const definition = getTechnique(techniqueId);
  if (!definition) throw new GameRuleError("功法不存在。");
  const expCost = definition.upgradeBattleExp[learned.stage];
  const stoneCost = definition.upgradeSpiritStones[learned.stage];
  requireAmount(player.battleExp, expCost, "战斗经验不足，无法升级功法。");
  requireAmount(player.spiritStones, stoneCost, "灵石不足，无法升级功法。");
  player.battleExp -= expCost;
  player.spiritStones -= stoneCost;
  learned.stage = (learned.stage + 1) as LearnedTechnique["stage"];
  if (learned.stage === 3) {
    learned.perfectedAt = Date.now();
  }
  pushLog(player, `《${definition.name}》提升至${TECHNIQUE_STAGE_LABELS[learned.stage]}。`);
  return player;
}

function challengeTrialTower(player: PlayerState, now: number): BattleResult {
  if (player.trialTower.failedCooldownUntil > now) {
    throw new GameRuleError("试炼塔失败冷却中。");
  }
  if (player.lifePoints <= 0) {
    throw new GameRuleError("生命值不足，需要先回洞府打坐恢复。");
  }

  const floor = player.trialTower.highestFloor + 1;
  const result = simulateBattle(
    { name: player.name, attributes: calculateAttributes(player) },
    makeTrialEnemy(floor),
  );

  if (result.won) {
    player.trialTower.highestFloor = floor;
    const rewards: RewardBundle = {
      battleExp: 18 + floor * 8,
      spiritStones: 8 + floor * 3,
    };
    if (floor % 5 === 0) {
      rewards.items = [generateEquipment(floor, player.realmIndex)];
    }
    addReward(player, rewards);
    if (floor >= 1 && !isGuideComplete(player, "trial-first")) {
      completeGuide(player, "trial-first");
    }
    pushLog(player, `试炼塔第 ${floor} 层通关。`);
  } else {
    player.lifePoints = Math.max(0, player.lifePoints - 1);
    player.trialTower.failedCooldownUntil = now + TRIAL_FAIL_COOLDOWN_MS;
    pushLog(player, "试炼塔挑战失败，扣除1点生命并进入1分钟冷却。");
  }

  return result;
}

function sweepTrialTower(player: PlayerState, now: number): void {
  const today = dateKey(now);
  if (player.trialTower.lastSweepDate === today) {
    throw new GameRuleError("今日已经扫荡过试炼塔。");
  }
  if (player.trialTower.highestFloor <= 0) {
    throw new GameRuleError("尚无历史通关层数，不能扫荡。");
  }

  let battleExp = 0;
  let spiritStones = 0;
  for (let floor = 1; floor <= player.trialTower.highestFloor; floor += 1) {
    battleExp += 18 + floor * 8;
    spiritStones += 8 + floor * 3;
  }
  addReward(player, { battleExp, spiritStones });
  player.trialTower.lastSweepDate = today;
  pushLog(player, `扫荡至第 ${player.trialTower.highestFloor} 层，获得全额奖励。`);
}

function challengeArena(player: PlayerState, opponentId: string, now: number): BattleResult {
  resetDailyCounters(player, now);
  if (player.arena.freeChallengesRemaining <= 0) {
    throw new GameRuleError("今日仙战次数不足。");
  }

  const selfPower = calculatePower(calculateAttributes(player));
  const opponent = generateArenaOpponents(player).find((entry) => entry.id === opponentId);
  if (!opponent) throw new GameRuleError("挑战目标不存在。");
  if (selfPower >= 200_000 && selfPower < 250_000 && opponent.power > selfPower) {
    throw new GameRuleError("保护期只能挑战战力不高于自己的目标。");
  }

  player.arena.freeChallengesRemaining -= 1;
  const result = simulateBattle(
    { name: player.name, attributes: calculateAttributes(player) },
    { name: opponent.name, attributes: opponent.attributes },
  );
  if (result.won) {
    if (selfPower >= 250_000) {
      player.arena.rank = Math.min(player.arena.rank ?? opponent.rank + 80, opponent.rank);
    }
    addReward(player, { reputation: 12, spiritStones: 20 });
    pushLog(player, `仙战胜利，击败 ${opponent.name}。`);
  } else {
    pushLog(player, `仙战落败，对战玩家无惩罚。`);
  }
  return result;
}

function buyArenaChallenge(player: PlayerState): void {
  if (player.arena.paidChallengesBought >= 5) {
    throw new GameRuleError("今日购买次数已达上限。");
  }
  const cost = 50 * (player.arena.paidChallengesBought + 1);
  requireAmount(player.spiritStones, cost, "灵石不足，无法购买挑战次数。");
  player.spiritStones -= cost;
  player.arena.paidChallengesBought += 1;
  player.arena.freeChallengesRemaining += 1;
  pushLog(player, `购买1次仙战挑战，消耗 ${cost} 灵石。`);
}

function challengeSpiritVein(player: PlayerState, now: number): BattleResult {
  if (player.spiritVein.failedCooldownUntil > now) {
    throw new GameRuleError("灵脉失败冷却中。");
  }
  if (player.lifePoints <= 0) {
    throw new GameRuleError("生命值不足，需要先回洞府打坐恢复。");
  }

  const layer = player.spiritVein.highestLayer + 1;
  const result = simulateBattle(
    { name: player.name, attributes: calculateAttributes(player) },
    makeVeinGuardian(layer),
  );
  if (result.won) {
    player.spiritVein.highestLayer = layer;
    addReward(player, {
      spiritStones: 10 + layer * 2,
      artifactFragments: layer % 3 === 0 ? [{ id: "taiji-jade", amount: 2 }] : undefined,
    });
    player.spiritVein.essence += 1 + Math.floor(layer / 10);
    if (layer >= 3000) {
      pushLog(player, "已解锁称号：灵脉大师。");
    } else {
      pushLog(player, `通关灵脉第 ${layer} 层。`);
    }
  } else {
    player.lifePoints = Math.max(0, player.lifePoints - 1);
    player.spiritVein.failedCooldownUntil = now + VEIN_FAIL_COOLDOWN_MS;
    pushLog(player, "灵脉挑战失败，进入5分钟冷却。");
  }
  return result;
}

function claimDailyLogin(player: PlayerState, now: number): void {
  const today = dateKey(now);
  if (player.daily.lastLoginRewardDate === today) {
    throw new GameRuleError("今日登录奖励已领取。");
  }
  player.daily.lastLoginRewardDate = today;
  addReward(player, { cultivation: REALMS[player.realmIndex].cultivationCap * 0.12, spiritStones: 35 });
  pushLog(player, "领取每日登录奖励。");
}

function claimStarterPack(player: PlayerState): void {
  if (player.guide.starterPackClaimed) {
    throw new GameRuleError("首充礼包已领取。");
  }
  if (!isGuideComplete(player, "trial-first")) {
    throw new GameRuleError("需要先完成第一层试炼塔。");
  }
  player.guide.starterPackClaimed = true;
  addReward(player, {
    spiritStones: 300,
    reputation: 30,
    artifactFragments: [{ id: "taiji-jade", amount: 20 }],
  });
  addConsumable(player, "protect_pill", "护脉丹", 2);
  addConsumable(player, "rebirth_stone", "轮回石", 1);
  completeGuide(player, "starter-pack");
  pushLog(player, "领取首充礼包：灵石、护脉丹、轮回石与神器碎片已入库。");
}

function equipItem(player: PlayerState, itemId: string): void {
  const item = player.inventory.find((entry): entry is EquipmentItem => entry.id === itemId && entry.kind === "equipment");
  if (!item) throw new GameRuleError("装备不存在。");
  if (item.realmOrderRequired > player.realmIndex) {
    throw new GameRuleError("境界不足，无法穿戴该装备。");
  }
  player.equipped[item.slot] = item.id;
  pushLog(player, `穿戴 ${item.name}。`);
}

function toggleItemLock(player: PlayerState, itemId: string): void {
  const item = player.inventory.find((entry) => entry.id === itemId);
  if (!item) throw new GameRuleError("道具不存在。");
  item.locked = !item.locked;
}

function sellLowQualityEquipment(player: PlayerState): void {
  const equippedIds = new Set(Object.values(player.equipped));
  let sold = 0;
  let gained = 0;
  player.inventory = player.inventory.filter((item) => {
    if (
      item.kind === "equipment" &&
      !item.locked &&
      !equippedIds.has(item.id) &&
      (item.quality === "white" || item.quality === "green")
    ) {
      sold += 1;
      gained += item.quality === "white" ? 8 : 16;
      return false;
    }
    return true;
  });
  player.spiritStones += gained;
  pushLog(player, `一键出售低品质装备 ${sold} 件，获得 ${gained} 灵石。`);
}

function enhanceEquipped(player: PlayerState, slot: EquipmentSlot): void {
  const itemId = player.equipped[slot];
  if (!itemId) throw new GameRuleError(`未穿戴${SLOT_LABEL[slot]}。`);
  const item = player.inventory.find((entry): entry is EquipmentItem => entry.id === itemId && entry.kind === "equipment");
  if (!item) throw new GameRuleError("装备不存在。");
  const cost = 20 * (item.enhanceLevel + 1);
  requireAmount(player.spiritStones, cost, "灵石不足，无法强化。");
  player.spiritStones -= cost;
  item.enhanceLevel += 1;
  pushLog(player, `${item.name} 强化至 +${item.enhanceLevel}。`);
}

function combineArtifact(player: PlayerState, artifactId: string): void {
  const artifact = player.artifacts.find((entry) => entry.id === artifactId);
  if (!artifact) throw new GameRuleError("神器不存在。");
  if (artifact.fragments < 100) {
    throw new GameRuleError("神器碎片不足100个。");
  }
  artifact.fragments -= 100;
  artifact.active = true;
  artifact.stars = Math.max(1, artifact.stars + 1);
  pushLog(player, `${artifact.name} 合成/升星成功。`);
}

function getGuideStep(player: PlayerState): GuideStep | undefined {
  if (!isGuideComplete(player, "start-cultivation")) {
    return {
      id: "start-cultivation",
      title: "开始修炼",
      body: "先在洞府打坐，修为会由服务器持续结算。",
      targetTab: "cave",
      primaryAction: { type: "startCultivation" },
    };
  }
  if (!isGuideComplete(player, "breakthrough")) {
    const canBreak = player.cultivation >= REALMS[player.realmIndex].cultivationCap;
    const protectPills = getConsumableQuantity(player, "protect_pill");
    return {
      id: "breakthrough",
      title: "提升境界",
      body: canBreak
        ? protectPills > 0
          ? "修为已满，使用护脉丹可确保突破成功。"
          : "修为已满，先购买护脉丹再突破。"
        : "修为未满，继续挂机至满额后突破。",
      targetTab: "cave",
      primaryAction: canBreak
        ? protectPills > 0
          ? { type: "breakthrough", useProtectPill: true }
          : { type: "buyProtectPill" }
        : undefined,
    };
  }
  if (!isGuideComplete(player, "learn-technique")) {
    return {
      id: "learn-technique",
      title: "学习第一本功法",
      body: "进入藏经阁，从佛法或道法书店学习一本基础功法。",
      targetTab: "library",
      primaryAction: { type: "learnTechnique", techniqueId: "breath-of-dao" },
    };
  }
  if (!isGuideComplete(player, "trial-first")) {
    return {
      id: "trial-first",
      title: "挑战试炼塔",
      body: "完成第一层试炼，获得战斗经验与灵石。",
      targetTab: "tower",
      primaryAction: { type: "challengeTrialTower" },
    };
  }
  if (!isGuideComplete(player, "starter-pack")) {
    return {
      id: "starter-pack",
      title: "领取首充礼包",
      body: "领取开局礼包，补齐后续突破与神器养成资源。",
      targetTab: "more",
      primaryAction: { type: "claimStarterPack" },
    };
  }
  return undefined;
}

function getMainTasks(player: PlayerState): MainTask[] {
  return [
    {
      id: "start-cultivation",
      title: "开始修炼",
      complete: isGuideComplete(player, "start-cultivation"),
      claimed: isGuideComplete(player, "start-cultivation"),
      rewards: { cultivation: 8, spiritStones: PROTECT_PILL_COST },
    },
    {
      id: "breakthrough",
      title: "完成第一次突破",
      complete: isGuideComplete(player, "breakthrough"),
      claimed: isGuideComplete(player, "breakthrough"),
      rewards: { spiritStones: 30 },
    },
    {
      id: "learn-technique",
      title: "学习任意功法",
      complete: player.learnedTechniques.length > 0,
      claimed: isGuideComplete(player, "learn-technique"),
      rewards: { battleExp: 40 },
    },
    {
      id: "trial-first",
      title: "通关试炼塔1层",
      complete: player.trialTower.highestFloor >= 1,
      claimed: isGuideComplete(player, "trial-first"),
      rewards: { battleExp: 26, spiritStones: 11 },
    },
  ];
}

function generateArenaOpponents(player: PlayerState): ArenaOpponent[] {
  const selfPower = calculatePower(calculateAttributes(player));
  const base = Math.max(120, selfPower);
  return [0.72, 0.95, 1.16].map((scale, index) => {
    const powerSeed = Math.floor(base * scale + 80 * (index + 1));
    const attrs: Attributes = {
      attack: Math.max(10, Math.floor(powerSeed / 110)),
      defense: Math.max(6, Math.floor(powerSeed / 220)),
      health: Math.max(100, Math.floor(powerSeed / 2.2)),
      speed: 96 + index * 8,
      critRate: 3 + index * 2,
      evasionRate: 1 + index,
      tenacity: index,
      accuracy: 100,
      damageBonus: index * 2,
    };
    return {
      id: `arena-bot-${index}`,
      name: ["守榜散修", "山门客卿", "问剑道人"][index],
      rank: 999 - index * 17,
      power: calculatePower(attrs),
      attributes: attrs,
    };
  });
}

function makeTrialEnemy(floor: number): Combatant {
  const attrs: Attributes = {
    attack: Math.floor(8 + floor * 2.8),
    defense: Math.floor(4 + floor * 1.7),
    health: Math.floor(70 + floor * 30),
    speed: 92 + Math.floor(floor / 3),
    critRate: floor % 7 === 0 ? 8 : 2,
    evasionRate: floor % 6 === 0 ? 7 : 1,
    tenacity: Math.floor(floor / 12),
    accuracy: 96,
    damageBonus: floor % 10 === 0 ? 6 : 0,
  };
  return { name: `试炼塔守卫·${floor}`, attributes: attrs };
}

function makeVeinGuardian(layer: number): Combatant {
  const attrs: Attributes = {
    attack: Math.floor(11 + layer * 3.2),
    defense: Math.floor(6 + layer * 1.9),
    health: Math.floor(90 + layer * 36),
    speed: 90 + Math.floor(layer / 4),
    critRate: layer % 8 === 0 ? 10 : 3,
    evasionRate: layer % 5 === 0 ? 5 : 1,
    tenacity: Math.floor(layer / 10),
    accuracy: 97,
    damageBonus: layer % 12 === 0 ? 8 : 0,
  };
  return { name: `灵脉守卫·${layer}`, attributes: attrs };
}

function generateEquipment(floor: number, realmIndex: number): EquipmentItem {
  const quality = QUALITIES[Math.min(QUALITIES.length - 1, Math.floor(floor / 12))] ?? "white";
  const slot = EQUIPMENT_SLOTS[floor % EQUIPMENT_SLOTS.length];
  const multiplier = QUALITY_MULTIPLIER[quality] * (1 + floor * 0.05);
  const attributes: Partial<Attributes> =
    slot === "weapon"
      ? { attack: Math.floor(8 * multiplier) }
      : slot === "robe"
        ? { defense: Math.floor(6 * multiplier), health: Math.floor(30 * multiplier) }
        : slot === "ring"
          ? { critRate: Math.min(8, Math.floor(1 + multiplier)) }
          : { health: Math.floor(45 * multiplier), defense: Math.floor(3 * multiplier) };

  return {
    id: createId("equip"),
    kind: "equipment",
    name: `${SLOT_LABEL[slot]}·试炼${floor}`,
    slot,
    quality,
    realmOrderRequired: Math.max(0, realmIndex - 1),
    attributes,
    enhanceLevel: 0,
    locked: false,
  };
}

function addReward(player: PlayerState, reward: RewardBundle): void {
  if (reward.cultivation) addCultivation(player, reward.cultivation);
  if (reward.battleExp) {
    player.battleExp = Math.min(getBattleExpCap(player), player.battleExp + Math.floor(reward.battleExp));
  }
  if (reward.spiritStones) player.spiritStones += Math.floor(reward.spiritStones);
  if (reward.reputation) player.reputation += Math.floor(reward.reputation);
  if (reward.items) player.inventory.push(...reward.items);
  if (reward.artifactFragments) {
    for (const fragment of reward.artifactFragments) {
      const artifact = player.artifacts.find((entry) => entry.id === fragment.id);
      if (artifact) artifact.fragments += fragment.amount;
    }
  }
}

function addCultivation(player: PlayerState, amount: number): void {
  const cap = REALMS[player.realmIndex].cultivationCap;
  player.cultivation = Math.min(cap, player.cultivation + amount);
}

function resetDailyCounters(player: PlayerState, now: number): void {
  const today = dateKey(now);
  if (player.arena.lastResetDate !== today) {
    player.arena.freeChallengesRemaining = 5;
    player.arena.paidChallengesBought = 0;
    player.arena.lastResetDate = today;
  }
}

function applySetBonuses(
  player: PlayerState,
  attributes: Attributes,
  percent: { attack: number; defense: number; health: number },
): void {
  const equipped = getEquippedItems(player);
  const groups = new Map<string, number>();
  for (const item of equipped) {
    const key = `${item.quality}-${item.realmOrderRequired}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  for (const count of groups.values()) {
    if (count >= 2) percent.attack += 0.05;
    if (count >= 4) percent.defense += 0.08;
    if (count >= 6) {
      percent.attack += 0.1;
      percent.health += 0.12;
      attributes.damageBonus += 3;
    }
  }
}

function getEquippedItems(player: PlayerState): EquipmentItem[] {
  const equippedIds = new Set(Object.values(player.equipped));
  return player.inventory.filter(
    (item): item is EquipmentItem => item.kind === "equipment" && equippedIds.has(item.id),
  );
}

function addAttributes(target: Attributes, source: Partial<Attributes>): void {
  for (const key of Object.keys(source) as Array<keyof Attributes>) {
    target[key] += source[key] ?? 0;
  }
}

function scaleAttributes(source: Partial<Attributes>, scale: number): Partial<Attributes> {
  const output: Partial<Attributes> = {};
  for (const key of Object.keys(source) as Array<keyof Attributes>) {
    output[key] = Math.floor((source[key] ?? 0) * scale);
  }
  return output;
}

function completeGuide(player: PlayerState, step: string): void {
  if (!player.guide.completedSteps.includes(step)) {
    player.guide.completedSteps.push(step);
  }
}

function isGuideComplete(player: PlayerState, step: string): boolean {
  return player.guide.completedSteps.includes(step);
}

function addConsumable(
  player: PlayerState,
  code: ConsumableItem["code"],
  name: string,
  quantity: number,
): void {
  const existing = player.inventory.find(
    (item): item is ConsumableItem => item.kind === "consumable" && item.code === code,
  );
  if (existing) {
    existing.quantity = Math.min(999, existing.quantity + quantity);
  } else {
    player.inventory.push({
      id: createId("item"),
      kind: "consumable",
      code,
      name,
      quantity,
      locked: false,
    });
  }
}

function consumeItem(
  player: PlayerState,
  code: ConsumableItem["code"],
  quantity: number,
  message: string,
): void {
  const item = player.inventory.find(
    (entry): entry is ConsumableItem => entry.kind === "consumable" && entry.code === code,
  );
  if (!item || item.quantity < quantity) {
    throw new GameRuleError(message);
  }
  item.quantity -= quantity;
  if (item.quantity <= 0) {
    player.inventory = player.inventory.filter((entry) => entry.id !== item.id);
  }
}

function getConsumableQuantity(player: PlayerState, code: ConsumableItem["code"]): number {
  return player.inventory.reduce((total, item) => {
    if (item.kind === "consumable" && item.code === code) {
      return total + item.quantity;
    }
    return total;
  }, 0);
}

function requireAmount(actual: number, required: number, message: string): void {
  if (actual < required) throw new GameRuleError(message);
}

function pushLog(player: PlayerState, message: string): void {
  player.log.unshift(message);
  player.log = player.log.slice(0, 24);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.floor(value * 100) / 100;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function countersElement(attacker: ElementKey, defender: ElementKey): boolean {
  return ELEMENT_COUNTERS[attacker] === defender;
}
