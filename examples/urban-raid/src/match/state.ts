export interface ScoreRow {
  id: string;
  name: string;
  score: number;
  kills: number;
  deaths: number;
  local: boolean;
}

export const BOT_NAMES = ["Mason", "Woods", "Bowman", "Hudson", "Weaver", "Reznov"] as const;

/** Match rules use simulation seconds, so the offline pause freezes every deadline. */
export class MatchState {
  readonly scoreLimit: number;
  readonly duration: number;
  readonly rows: ScoreRow[];
  started = false;
  finished = false;
  remaining: number;
  outcome = "";
  respawnRemaining = 0;
  playerDead = false;
  enemyScore = 0;
  readonly respawns = new Map<string, number>();

  constructor(options: { duration?: number; scoreLimit?: number } = {}) {
    this.duration = options.duration ?? 600;
    this.scoreLimit = options.scoreLimit ?? 1500;
    this.remaining = this.duration;
    this.rows = [
      { id: "player", name: "You", score: 0, kills: 0, deaths: 0, local: true },
      ...BOT_NAMES.map((name, i) => ({
        id: `bot-${i}`, name, score: 0, kills: 0, deaths: 0, local: false,
      })),
    ];
  }

  get local() { return this.rows[0]!; }

  start() {
    this.started = true;
    this.finished = false;
    this.remaining = this.duration;
    this.outcome = "";
    this.playerDead = false;
    this.respawnRemaining = 0;
    this.enemyScore = 0;
    this.respawns.clear();
    for (const row of this.rows) row.score = row.kills = row.deaths = 0;
  }

  death(victimId: string, killerId: string | null) {
    if (!this.started || this.finished || this.respawns.has(victimId)) return false;
    const victim = this.rows.find(row => row.id === victimId);
    if (!victim) return false;
    victim.deaths++;
    this.respawns.set(victimId, victim.local ? 3 : 4);
    if (victim.local) {
      this.playerDead = true;
      this.respawnRemaining = 3;
      this.enemyScore += 100;
    }
    const killer = this.rows.find(row => row.id === killerId);
    if (killer && killer !== victim) {
      killer.kills++;
      killer.score += 100;
    }
    this.checkEnd();
    return true;
  }

  respawn(id: string) {
    this.respawns.delete(id);
    if (id === "player") {
      this.playerDead = false;
      this.respawnRemaining = 0;
    }
  }

  tick(dt: number) {
    const ready: string[] = [];
    if (!this.started || this.finished || !(dt > 0)) return ready;
    this.remaining = Math.max(0, this.remaining - dt);
    this.checkEnd();
    if (this.finished) return ready;
    for (const [id, delay] of this.respawns) {
      const left = Math.max(0, delay - dt);
      this.respawns.set(id, left);
      if (id === "player") this.respawnRemaining = left;
      if (left === 0) ready.push(id);
    }
    return ready;
  }

  private checkEnd() {
    if (this.remaining > 0 && this.local.score < this.scoreLimit && this.enemyScore < this.scoreLimit) return;
    this.finished = true;
    this.outcome = this.local.score === this.enemyScore ? "DRAW" : this.local.score > this.enemyScore ? "VICTORY" : "DEFEAT";
    this.respawnRemaining = 0;
    this.respawns.clear();
  }
}

export interface SpawnCandidate { index: number; clearance: boolean; distance: number; visible: boolean; crowding: number }

/** Reject obstructed spawns, then prefer cover and space from opponents. */
export function chooseSpawn(candidates: readonly SpawnCandidate[]) {
  let best = -1, score = -Infinity;
  for (const c of candidates) {
    if (!c.clearance) continue;
    const value = Math.min(c.distance, 50) - (c.visible ? 35 : 0) - c.crowding * 18;
    if (value > score) { score = value; best = c.index; }
  }
  return best;
}

/** Flash exposure includes distance, a rear-facing reduction, and world occlusion. */
export function flashExposure(distance: number, facing: number, visible: boolean) {
  if (!visible || distance >= 16) return 0;
  return Math.min(1, Math.max(0, 1 - distance / 16) * (facing > 0.2 ? 1.3 : 0.38));
}
