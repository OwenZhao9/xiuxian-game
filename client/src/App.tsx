import {
  Backpack,
  Bell,
  BookOpen,
  ChevronsUp,
  CircleDot,
  Coins,
  Gem,
  Hammer,
  HeartPulse,
  Home,
  Lock,
  MoreHorizontal,
  Mountain,
  PackageCheck,
  Play,
  RefreshCw,
  Scroll,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  Trophy,
  Unlock,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGameState, sendGameAction } from "./api";
import {
  ARTIFACTS,
  ELEMENT_LABEL,
  PROTECT_PILL_COST,
  QUALITY_LABEL,
  REALMS,
  SLOT_LABEL,
  TECHNIQUE_STAGE_LABELS,
  TECHNIQUES,
} from "../../shared/balance";
import { formatNumberZh } from "../../shared/game";
import type {
  AppTab,
  BattleResult,
  EquipmentItem,
  EquipmentSlot,
  GameAction,
  InventoryItem,
  LearnedTechnique,
  PublicGameState,
  TechniqueDefinition,
} from "../../shared/types";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const tabs: Array<{ id: AppTab; label: string; icon: typeof Home }> = [
  { id: "cave", label: "修炼", icon: Home },
  { id: "library", label: "藏经", icon: BookOpen },
  { id: "tower", label: "试炼", icon: Mountain },
  { id: "arena", label: "仙战", icon: Swords },
  { id: "bag", label: "背包", icon: Backpack },
  { id: "more", label: "更多", icon: MoreHorizontal },
];

export function App() {
  const [game, setGame] = useState<PublicGameState | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("cave");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualTimeRef = useRef(0);

  const load = useCallback(async () => {
    const state = await fetchGameState();
    setGame(state);
  }, []);

  useEffect(() => {
    load().catch((loadError) => setError(loadError.message));
    const timer = window.setInterval(() => {
      load().catch((loadError) => setError(loadError.message));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (game?.guideStep) {
      setActiveTab(game.guideStep.targetTab);
    }
  }, [game?.guideStep?.id, game?.guideStep?.targetTab]);

  const act = useCallback(
    async (action: GameAction) => {
      setBusy(true);
      setError(null);
      try {
        const result = await sendGameAction(action);
        if ("ok" in result) {
          window.location.reload();
          return;
        }
        setGame(result);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "操作失败");
      } finally {
        setBusy(false);
      }
    },
    [setGame],
  );

  useEffect(() => {
    window.render_game_to_text = () => {
      if (!game) return JSON.stringify({ status: "loading" });
      return JSON.stringify({
        coordinate_system: "CSS pixels, origin at top-left of the mobile viewport, y-axis downward",
        screen: activeTab,
        guide_step: game.guideStep?.id ?? "complete",
        realm: game.realm.name,
        cultivation: {
          current: Math.floor(game.player.cultivation),
          required: game.realm.cultivationCap,
          per_second: game.cultivationPerSecond,
        },
        resources: {
          spirit_stones: game.player.spiritStones,
          battle_exp: game.player.battleExp,
          reputation: game.player.reputation,
          life: game.player.lifePoints,
        },
        power: game.power,
        visible_tab_buttons: tabs.map((tab) => tab.id),
        latest_log: game.player.log[0],
      });
    };
  }, [activeTab, game]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !game) return;
    let frame = 0;
    let animationId = 0;
    const render = () => {
      visualTimeRef.current += 16;
      drawScene(canvas, game, visualTimeRef.current);
      frame += 1;
      animationId = window.requestAnimationFrame(render);
    };
    render();
    window.advanceTime = (ms: number) => {
      visualTimeRef.current += ms;
      drawScene(canvas, game, visualTimeRef.current);
    };
    return () => {
      window.cancelAnimationFrame(animationId);
      if (frame > 0) window.advanceTime = undefined;
    };
  }, [game]);

  if (!game) {
    return (
      <div className="app-shell loading-shell">
        <div className="loading-mark">今生我要修成仙</div>
      </div>
    );
  }

  const progress = Math.min(100, (game.player.cultivation / game.realm.cultivationCap) * 100);

  return (
    <div className="app-shell">
      <header className="scene-header">
        <canvas ref={canvasRef} width={750} height={420} id="scene-canvas" aria-label="洞府水墨场景" />
        <div className="scene-copy">
          <div>
            <h1>今生我要修成仙</h1>
            <p>{game.realm.name}</p>
          </div>
          <button className="icon-button" onClick={() => act({ type: "toggleSound" })} aria-label="音效开关">
            {game.player.settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </header>

      <section className="status-strip" aria-label="角色状态">
        <Metric icon={Sparkles} label="修为" value={`${formatNumberZh(game.player.cultivation)} / ${formatNumberZh(game.realm.cultivationCap)}`} />
        <Metric icon={Swords} label="战力" value={formatNumberZh(game.power)} />
        <Metric icon={Coins} label="灵石" value={formatNumberZh(game.player.spiritStones)} />
        <Metric icon={HeartPulse} label="生命" value={`${game.player.lifePoints}/${game.player.maxLifePoints}`} />
      </section>

      <div className="progress-track" aria-label="修为进度">
        <span style={{ width: `${progress}%` }} />
      </div>

      {error ? (
        <div className="error-bar" role="alert">
          {error}
        </div>
      ) : null}

      <main className="content-area">
        {activeTab === "cave" ? <CavePanel game={game} busy={busy} act={act} /> : null}
        {activeTab === "library" ? <LibraryPanel game={game} busy={busy} act={act} /> : null}
        {activeTab === "tower" ? <TowerPanel game={game} busy={busy} act={act} /> : null}
        {activeTab === "arena" ? <ArenaPanel game={game} busy={busy} act={act} /> : null}
        {activeTab === "bag" ? <BagPanel game={game} busy={busy} act={act} /> : null}
        {activeTab === "more" ? <MorePanel game={game} busy={busy} act={act} /> : null}
      </main>

      <nav className="bottom-nav" aria-label="主导航">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
            >
              <Icon size={19} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {game.guideStep ? (
        <GuideOverlay
          game={game}
          busy={busy}
          act={act}
          onTargetTab={(tab) => setActiveTab(tab)}
        />
      ) : null}
    </div>
  );
}

function CavePanel({ game, busy, act }: PanelProps) {
  const hasProtectPill = getConsumableQuantity(game.player.inventory, "protect_pill") > 0;
  const canBreakthrough = game.player.cultivation >= game.realm.cultivationCap && Boolean(game.nextRealm);
  return (
    <section className="panel">
      <div className="panel-title">
        <CircleDot size={18} />
        <h2>修炼台</h2>
      </div>

      <div className="stat-grid">
        <Stat label="攻击" value={game.attributes.attack} />
        <Stat label="防御" value={game.attributes.defense} />
        <Stat label="生命" value={game.attributes.health} />
        <Stat label="暴击" value={`${game.attributes.critRate}%`} />
        <Stat label="闪避" value={`${game.attributes.evasionRate}%`} />
        <Stat label="增伤" value={`${game.attributes.damageBonus}%`} />
      </div>

      <div className="action-row">
        <button className="primary-action" disabled={busy || game.player.cultivating} onClick={() => act({ type: "startCultivation" })}>
          <Play size={17} />
          开始修炼
        </button>
        <button disabled={busy || !canBreakthrough} onClick={() => act({ type: "breakthrough", useProtectPill: false })}>
          <ChevronsUp size={17} />
          突破
        </button>
        <button disabled={busy || !canBreakthrough || !hasProtectPill} onClick={() => act({ type: "breakthrough", useProtectPill: true })}>
          <Shield size={17} />
          护脉突破
        </button>
      </div>

      <div className="two-column">
        <div className="surface">
          <h3>天赋灵根</h3>
          <p>修行 {game.player.talents.cultivation} / 战斗 {game.player.talents.combat} / 福缘 {game.player.talents.fortune}</p>
          <p>灵根：{ELEMENT_LABEL[game.player.spiritualRoot]}</p>
          <button disabled={busy} onClick={() => act({ type: "resetTalent" })}>
            <RefreshCw size={16} />
            轮回洗练
          </button>
        </div>
        <div className="surface">
          <h3>补给</h3>
          <p>修炼速度 {game.cultivationPerSecond.toFixed(2)} / 秒</p>
          <button disabled={busy || game.player.spiritStones < PROTECT_PILL_COST} onClick={() => act({ type: "buyProtectPill" })}>
            <ShoppingBag size={16} />
            护脉丹 {PROTECT_PILL_COST}
          </button>
          <button disabled={busy || game.player.lifePoints === game.player.maxLifePoints} onClick={() => act({ type: "recoverLife" })}>
            <HeartPulse size={16} />
            回洞府恢复
          </button>
          <button disabled={busy || game.player.daily.lastLoginRewardDate === formatDate(game.now)} onClick={() => act({ type: "claimDailyLogin" })}>
            <PackageCheck size={16} />
            每日登录
          </button>
        </div>
      </div>

      <TaskList game={game} />
      <LogList logs={game.player.log} />
    </section>
  );
}

function LibraryPanel({ game, busy, act }: PanelProps) {
  const [school, setSchool] = useState<"dao" | "buddha" | "self">("dao");
  const visible = TECHNIQUES.filter((technique) => technique.school === school);
  return (
    <section className="panel">
      <div className="panel-title">
        <BookOpen size={18} />
        <h2>藏经阁</h2>
      </div>
      <div className="segmented">
        <button className={school === "dao" ? "active" : ""} onClick={() => setSchool("dao")}>道法书店</button>
        <button className={school === "buddha" ? "active" : ""} onClick={() => setSchool("buddha")}>佛法书店</button>
        <button className={school === "self" ? "active" : ""} onClick={() => setSchool("self")}>自创</button>
      </div>

      <div className="list">
        {visible.map((technique) => (
          <TechniqueRow
            key={technique.id}
            technique={technique}
            learned={game.player.learnedTechniques.find((entry) => entry.id === technique.id)}
            busy={busy}
            act={act}
          />
        ))}
      </div>
    </section>
  );
}

function TechniqueRow({ technique, learned, busy, act }: {
  technique: TechniqueDefinition;
  learned?: LearnedTechnique;
  busy: boolean;
  act: (action: GameAction) => Promise<void>;
}) {
  const stage = learned ? TECHNIQUE_STAGE_LABELS[learned.stage] : "未学";
  const nextCost = learned && learned.stage < 3
    ? `${technique.upgradeBattleExp[learned.stage]} 战斗经验 / ${technique.upgradeSpiritStones[learned.stage]} 灵石`
    : "";
  return (
    <article className="row-card">
      <div>
        <h3>《{technique.name}》</h3>
        <p>{technique.description}</p>
        <span className="tag">{ELEMENT_LABEL[technique.element]} · {stage}</span>
      </div>
      {learned ? (
        <button disabled={busy || learned.stage >= 3} onClick={() => act({ type: "upgradeTechnique", techniqueId: technique.id })}>
          <ChevronsUp size={16} />
          {learned.stage >= 3 ? "圆满" : nextCost}
        </button>
      ) : (
        <button disabled={busy || technique.school === "self"} onClick={() => act({ type: "learnTechnique", techniqueId: technique.id })}>
          <Scroll size={16} />
          学习
        </button>
      )}
    </article>
  );
}

function TowerPanel({ game, busy, act }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-title">
        <Mountain size={18} />
        <h2>试炼塔</h2>
      </div>
      <div className="hero-line">
        <strong>历史最高 {game.player.trialTower.highestFloor} 层</strong>
        <span>{cooldownText(game.player.trialTower.failedCooldownUntil, game.now)}</span>
      </div>
      <div className="action-row">
        <button className="primary-action" disabled={busy || game.player.trialTower.failedCooldownUntil > game.now} onClick={() => act({ type: "challengeTrialTower" })}>
          <Swords size={17} />
          挑战下一层
        </button>
        <button disabled={busy || game.player.trialTower.highestFloor <= 0} onClick={() => act({ type: "sweepTrialTower" })}>
          <RefreshCw size={17} />
          今日扫荡
        </button>
      </div>
      <BattleSummary battle={game.lastBattle} />
    </section>
  );
}

function ArenaPanel({ game, busy, act }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-title">
        <Trophy size={18} />
        <h2>仙战榜单</h2>
      </div>
      <div className="hero-line">
        <strong>今日次数 {game.player.arena.freeChallengesRemaining}</strong>
        <span>排名 {game.player.arena.rank ?? "未上榜"}</span>
      </div>
      <div className="list">
        {game.arenaOpponents.map((opponent) => (
          <article className="row-card" key={opponent.id}>
            <div>
              <h3>{opponent.name}</h3>
              <p>排名 {opponent.rank} · 战力 {formatNumberZh(opponent.power)}</p>
            </div>
            <button disabled={busy || game.player.arena.freeChallengesRemaining <= 0} onClick={() => act({ type: "challengeArena", opponentId: opponent.id })}>
              <Swords size={16} />
              挑战
            </button>
          </article>
        ))}
      </div>
      <button disabled={busy || game.player.arena.paidChallengesBought >= 5} onClick={() => act({ type: "buyArenaChallenge" })}>
        <Coins size={16} />
        购买次数
      </button>
      <BattleSummary battle={game.lastBattle} />
    </section>
  );
}

function BagPanel({ game, busy, act }: PanelProps) {
  const equipment = game.player.inventory.filter((item): item is EquipmentItem => item.kind === "equipment");
  const consumables = game.player.inventory.filter((item) => item.kind === "consumable");
  return (
    <section className="panel">
      <div className="panel-title">
        <Backpack size={18} />
        <h2>背包</h2>
      </div>
      <div className="action-row">
        <button disabled={busy} onClick={() => act({ type: "sellLowQualityEquipment" })}>
          <Coins size={16} />
          出售白绿
        </button>
      </div>

      <div className="equipment-grid">
        {(Object.keys(SLOT_LABEL) as EquipmentSlot[]).map((slot) => {
          const item = equipment.find((entry) => entry.id === game.player.equipped[slot]);
          return (
            <button key={slot} disabled={busy || !item} onClick={() => act({ type: "enhanceEquipped", slot })}>
              <Hammer size={15} />
              {SLOT_LABEL[slot]} {item ? `+${item.enhanceLevel}` : "空"}
            </button>
          );
        })}
      </div>

      <div className="list">
        {equipment.length === 0 ? <p className="empty-text">暂无装备，试炼塔每5层可能掉落。</p> : null}
        {equipment.map((item) => (
          <InventoryRow key={item.id} item={item} busy={busy} act={act} equipped={Object.values(game.player.equipped).includes(item.id)} />
        ))}
        {consumables.map((item) => (
          <article className="row-card compact" key={item.id}>
            <div>
              <h3>{item.name}</h3>
              <p>数量 {item.quantity}</p>
            </div>
          </article>
        ))}
      </div>

      <ArtifactList game={game} busy={busy} act={act} />
    </section>
  );
}

function InventoryRow({ item, busy, act, equipped }: {
  item: EquipmentItem;
  busy: boolean;
  equipped: boolean;
  act: (action: GameAction) => Promise<void>;
}) {
  return (
    <article className="row-card">
      <div>
        <h3>{item.name}</h3>
        <p>{QUALITY_LABEL[item.quality]} · {SLOT_LABEL[item.slot]} · +{item.enhanceLevel}</p>
        <span className="tag">{attributeText(item)}</span>
      </div>
      <div className="inline-buttons">
        <button disabled={busy || equipped} onClick={() => act({ type: "equipItem", itemId: item.id })}>
          <Shield size={15} />
          {equipped ? "已穿" : "穿戴"}
        </button>
        <button disabled={busy} onClick={() => act({ type: "toggleItemLock", itemId: item.id })} aria-label="锁定装备">
          {item.locked ? <Lock size={15} /> : <Unlock size={15} />}
        </button>
      </div>
    </article>
  );
}

function MorePanel({ game, busy, act }: PanelProps) {
  const canClaimStarter = !game.player.guide.starterPackClaimed && game.player.trialTower.highestFloor >= 1;
  return (
    <section className="panel">
      <div className="panel-title">
        <MoreHorizontal size={18} />
        <h2>更多</h2>
      </div>
      <div className="surface">
        <h3><Gem size={16} /> 抢夺灵脉</h3>
        <p>最高 {game.player.spiritVein.highestLayer} 层 · 精华 {game.player.spiritVein.essence}</p>
        <div className="action-row">
          <button disabled={busy || game.player.spiritVein.failedCooldownUntil > game.now} onClick={() => act({ type: "challengeSpiritVein" })}>
            <Swords size={16} />
            挑战灵脉
          </button>
          <button disabled={busy || game.player.spiritVein.highestLayer <= 0} onClick={() => act({ type: "stationSpiritVein" })}>
            <UserRound size={16} />
            派遣化身
          </button>
        </div>
      </div>

      <div className="surface">
        <h3><ShoppingBag size={16} /> 商城</h3>
        <div className="action-row">
          <button disabled={busy || game.player.spiritStones < PROTECT_PILL_COST} onClick={() => act({ type: "buyProtectPill" })}>
            <Shield size={16} />
            护脉丹
          </button>
          <button disabled={busy || !canClaimStarter} onClick={() => act({ type: "claimStarterPack" })}>
            <PackageCheck size={16} />
            首充礼包
          </button>
        </div>
      </div>

      <div className="surface">
        <h3><Bell size={16} /> 邮件</h3>
        {game.player.mail.map((mail) => (
          <p key={mail.id}>{mail.title} · {mail.claimed ? "已读" : "未领"}</p>
        ))}
      </div>

      <button className="danger-action" disabled={busy} onClick={() => act({ type: "logout" })}>
        注销账号
      </button>
    </section>
  );
}

function GuideOverlay({ game, busy, act, onTargetTab }: {
  game: PublicGameState;
  busy: boolean;
  act: (action: GameAction) => Promise<void>;
  onTargetTab: (tab: AppTab) => void;
}) {
  const guide = game.guideStep;
  if (!guide) return null;
  const action = guide.primaryAction;
  return (
    <div className="guide-backdrop">
      <section className="guide-box" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <h2 id="guide-title">{guide.title}</h2>
        <p>{guide.body}</p>
        <button
          className="primary-action"
          data-testid="guide-primary"
          disabled={busy || !action}
          onClick={() => {
            onTargetTab(guide.targetTab);
            if (action) void act(action);
          }}
        >
          <Sparkles size={17} />
          {guideButtonText(action)}
        </button>
      </section>
    </div>
  );
}

function TaskList({ game }: { game: PublicGameState }) {
  return (
    <div className="surface">
      <h3>主线任务</h3>
      {game.mainTasks.map((task) => (
        <div className="task-line" key={task.id}>
          <span>{task.title}</span>
          <strong>{task.complete ? "完成" : "进行中"}</strong>
        </div>
      ))}
    </div>
  );
}

function LogList({ logs }: { logs: string[] }) {
  return (
    <div className="surface">
      <h3>最近动态</h3>
      <ul className="log-list">
        {logs.slice(0, 5).map((log, index) => (
          <li key={`${log}-${index}`}>{log}</li>
        ))}
      </ul>
    </div>
  );
}

function BattleSummary({ battle }: { battle?: BattleResult }) {
  if (!battle) return null;
  const last = battle.rounds.at(-1);
  return (
    <div className="surface">
      <h3>战斗结果</h3>
      <p>{battle.won ? "胜利" : "失败"} · 我方剩余 {Math.max(0, Math.floor(battle.playerRemainingHp))} 生命</p>
      {last ? <p>最后一击：{last.actor} 对 {last.target} 造成 {last.damage} 伤害</p> : null}
    </div>
  );
}

function ArtifactList({ game, busy, act }: PanelProps) {
  return (
    <div className="surface">
      <h3>神器</h3>
      {game.player.artifacts.map((artifact) => {
        const definition = ARTIFACTS.find((entry) => entry.id === artifact.id);
        return (
          <div className="task-line" key={artifact.id}>
            <span>{artifact.name} · {artifact.fragments}/100 {definition?.fragmentName}</span>
            <button disabled={busy || artifact.fragments < 100} onClick={() => act({ type: "combineArtifact", artifactId: artifact.id })}>
              <Gem size={15} />
              合成
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string }) {
  return (
    <div className="metric">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface PanelProps {
  game: PublicGameState;
  busy: boolean;
  act: (action: GameAction) => Promise<void>;
}

function drawScene(canvas: HTMLCanvasElement, game: PublicGameState, time: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#f7f0df");
  gradient.addColorStop(0.58, "#dce7d7");
  gradient.addColorStop(1, "#b8c8b2");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.2;
  context.fillStyle = "#1d2b24";
  for (let i = 0; i < 9; i += 1) {
    const x = ((i * 97 + time * 0.018) % (width + 160)) - 80;
    const y = 58 + Math.sin(time * 0.001 + i) * 28 + i * 22;
    context.beginPath();
    context.ellipse(x, y, 82, 16, -0.2, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;
  context.strokeStyle = "#1f3128";
  context.lineWidth = 8;
  context.beginPath();
  context.arc(width / 2, 216, 82, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#1f3128";
  context.beginPath();
  context.arc(width / 2, 175, 40, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f7f0df";
  context.beginPath();
  context.arc(width / 2, 257, 40, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#b83b2e";
  context.beginPath();
  context.arc(width / 2, 175, 8 + Math.sin(time * 0.004) * 2, 0, Math.PI * 2);
  context.arc(width / 2, 257, 8 + Math.cos(time * 0.004) * 2, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(31, 49, 40, 0.16)";
  context.beginPath();
  context.ellipse(width / 2, 372, 190, 22, 0, 0, Math.PI * 2);
  context.fill();
}

function getConsumableQuantity(items: InventoryItem[], code: string): number {
  return items.reduce((total, item) => {
    if (item.kind === "consumable" && item.code === code) return total + item.quantity;
    return total;
  }, 0);
}

function attributeText(item: EquipmentItem): string {
  return Object.entries(item.attributes)
    .map(([key, value]) => `${attributeLabel(key)} +${value}`)
    .join(" / ");
}

function attributeLabel(key: string): string {
  const labels: Record<string, string> = {
    attack: "攻击",
    defense: "防御",
    health: "生命",
    critRate: "暴击",
    evasionRate: "闪避",
    tenacity: "韧性",
    damageBonus: "增伤",
  };
  return labels[key] ?? key;
}

function cooldownText(deadline: number, now: number): string {
  if (deadline <= now) return "无冷却";
  const seconds = Math.ceil((deadline - now) / 1000);
  if (seconds < 60) return `${seconds}秒`;
  return `${Math.ceil(seconds / 60)}分钟`;
}

function guideButtonText(action?: GameAction): string {
  if (!action) return "等待条件";
  const labels: Record<GameAction["type"], string> = {
    startCultivation: "开始修炼",
    buyProtectPill: "购买护脉丹",
    breakthrough: "立即突破",
    recoverLife: "恢复生命",
    resetTalent: "洗练",
    learnTechnique: "学习功法",
    upgradeTechnique: "升级功法",
    challengeTrialTower: "挑战一层",
    sweepTrialTower: "扫荡",
    challengeArena: "挑战",
    buyArenaChallenge: "购买次数",
    challengeSpiritVein: "挑战灵脉",
    stationSpiritVein: "派遣化身",
    claimDailyLogin: "领取",
    claimStarterPack: "领取礼包",
    equipItem: "穿戴",
    toggleItemLock: "锁定",
    sellLowQualityEquipment: "出售",
    enhanceEquipped: "强化",
    combineArtifact: "合成",
    toggleSound: "音效",
    logout: "注销",
  };
  return labels[action.type];
}

function formatDate(now: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}
