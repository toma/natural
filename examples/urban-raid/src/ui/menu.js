import { el, setText, setStyle, clamp, damp, ease } from "./util.js";
import { WEAPON_CATALOG } from "../weapons/loadout.ts";
import {
  SETTINGS_KEY,
  QUALITY_NAMES,
  MENU_DEFAULTS,
  readSettings,
  focusIndex,
} from "./settings.ts";
import { WeaponPreview } from "./weapon-preview.js";

/** Start, pause, loadout and options share one menu and one paused match. */
export class PauseMenu {
  constructor(parent, ctx) {
    this.ctx = ctx;
    this.open = false;
    this.shown = 0;
    this.page = "home";
    this.selected = "rifle";
    this.root = el("div", "ow-menu", parent);
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "NaturalFPS menu");
    const inner = el("div", "nf-menu-shell", this.root);
    const mast = el("header", "nf-menu-mast", inner);
    el("div", "nf-brand", mast, "NATURALFPS");
    el("div", "nf-session", mast, "COMBAT TRAINING / LOCAL MATCH");
    const heading = el("div", "nf-menu-heading", inner);
    this.heading = el("h1", null, heading, "ATOMIC CUL-DE-SAC");
    this.status = el("div", "nf-menu-status", heading, "NEVADA, USA / 1963");
    const body = el("div", "nf-menu-body", inner);
    const aside = el("nav", "nf-menu-nav", body);
    aside.setAttribute("aria-label", "Game menu");
    this.nav = {};
    for (const [id, label, action] of [
      ["home", "PLAY", () => (this.ctx.peek("match")?.started ? this.close() : this.deploy())],
      ["loadout", "CHANGE LOADOUT", () => this.setPage("loadout")],
      ["options", "OPTIONS", () => this.setPage("options")],
      [
        "restart",
        "RESTART MATCH",
        () => {
          this.ctx.peek("match")?.restart();
          this.close();
        },
      ],
    ]) {
      const b = this._button(aside, "nf-nav-button", label, action);
      this.nav[id] = b;
    }
    this.resumeBtn = this.nav.home;
    el("div", "nf-nav-divider", aside);
    const info = el("div", "nf-map-info", aside);
    el("strong", null, info, "FREE-FOR-ALL");
    el("span", null, info, "10:00 / 1,500 POINTS");
    el("p", null, info, "A quiet neighborhood. A short walk to the next firefight.");
    this.panels = el("div", "nf-menu-panels", body);
    this.home = el("section", "nf-menu-home", this.panels);
    el("div", "nf-eyebrow", this.home, "YOUR LOADOUT");
    this.loadout = el("section", "nf-menu-loadout", this.panels);
    el("div", "nf-eyebrow", this.loadout, "SELECT PRIMARY WEAPON");
    this.choices = el("div", "nf-weapon-list", this.loadout);
    this.weaponBtns = new Map();
    for (const weapon of WEAPON_CATALOG) {
      if (weapon.id === "pistol") continue;
      const b = this._button(this.choices, "nf-weapon-choice", "", () =>
        this.selectWeapon(weapon.id),
      );
      b.dataset.weapon = weapon.id;
      el("span", "nf-choice-index", b, String(this.weaponBtns.size + 1).padStart(2, "0"));
      el("strong", null, b, weapon.label);
      el("small", null, b, weapon.category);
      b.setAttribute("aria-pressed", "false");
      this.weaponBtns.set(weapon.id, b);
    }
    this.weaponPanel = el("div", "nf-weapon-panel", this.panels);
    const title = el("div", "nf-weapon-title", this.weaponPanel);
    this.weaponName = el("h2", null, title, "COMMANDO");
    this.weaponCategory = el("span", null, title, "ASSAULT RIFLE");
    const stage = el("div", "nf-preview-stage", this.weaponPanel);
    this.previewCanvas = el("canvas", "nf-weapon-preview", stage);
    this.previewCanvas.setAttribute("role", "img");
    this.preview = new WeaponPreview(this.previewCanvas, ctx);
    el("span", "nf-preview-label", stage, "PRIMARY / STANDARD ISSUE");
    this.description = el("p", "nf-weapon-description", this.weaponPanel);
    this.specs = el("div", "nf-weapon-specs", this.weaponPanel);
    this.specValues = [];
    for (const name of ["DAMAGE", "FIRE RATE", "MOBILITY", "RANGE"]) {
      const col = el("div", "nf-stat", this.specs);
      el("span", null, col, name);
      const track = el("div", "nf-stat-track", col);
      this.specValues.push(el("i", null, track));
    }
    const equipment = el("div", "nf-loadout-equipment", this.weaponPanel);
    for (const [slot, name] of [
      ["SECONDARY", "M1911"],
      ["LETHAL", "FRAG × 1"],
      ["TACTICAL", "FLASHBANG × 2"],
    ]) {
      const col = el("div", null, equipment);
      el("span", null, col, slot);
      el("strong", null, col, name);
    }
    const deployRow = el("div", "nf-deploy-row", this.weaponPanel);
    this.deployBtn = this._button(deployRow, "ow-btn primary", "DEPLOY", () => this.deploy());
    this.deployHint = el("span", null, deployRow, "ENTER THE MATCH");
    this.options = el("section", "nf-menu-options", this.panels);
    el("div", "nf-eyebrow", this.options, "OPTIONS");
    this.rows = el("div", null, this.options);
    this.qBtns = [];
    const quality = el("div", "ow-seg", this._row("Graphics preset"));
    for (const name of QUALITY_NAMES)
      this.qBtns.push(this._button(quality, "", name, () => this.setQuality(name)));
    this.sens = this._slider("Mouse sensitivity", 0.2, 3, 0.01, (v) => {
      ctx.config.sensitivity = 0.0022 * v;
      ctx.events.emit("ui:sensitivity", { value: ctx.config.sensitivity, multiplier: v });
      return v.toFixed(2);
    });
    this.fov = this._slider("Field of view", 65, 120, 1, (v) => {
      ctx.config.fov = v;
      ctx.camera.fov = v;
      ctx.camera.updateProjectionMatrix();
      ctx.events.emit("ui:fov", { value: v });
      return String(v | 0);
    });
    this.invBtns = [];
    const inverse = el("div", "ow-seg", this._row("Invert look"));
    for (const value of [false, true]) {
      const b = this._button(inverse, "", value ? "ON" : "OFF", () => {
        ctx.config.invertY = value;
        ctx.events.emit("ui:setting", { key: "invertY", value });
        this.syncFromConfig();
        this.save();
      });
      this.invBtns.push([b, value]);
    }
    this._button(this.options, "ow-btn nf-defaults", "RESTORE DEFAULTS", () => {
      Object.assign(ctx.config, MENU_DEFAULTS);
      this.setQuality(MENU_DEFAULTS.quality);
    });
    const keys = el("div", "nf-controls", this.options);
    el("h3", null, keys, "CONTROLS");
    for (const [key, name] of [
      ["W A S D", "MOVE"],
      ["SHIFT", "SPRINT / HOLD BREATH"],
      ["C / CTRL", "CROUCH / PRONE"],
      ["SHIFT + CTRL", "DIVE"],
      ["SPACE", "JUMP"],
      ["R", "RELOAD"],
      ["1 / WHEEL", "SWAP WEAPON"],
      ["Q / E", "LEAN"],
      ["V", "MELEE"],
      ["G / MIDDLE", "FRAG GRENADE"],
      ["4", "FLASHBANG"],
      ["F", "PICK UP WEAPON"],
      ["TAB", "SCOREBOARD"],
    ]) {
      const row = el("div", null, keys);
      el("kbd", null, row, key);
      el("span", null, row, name);
    }
    const footer = el("footer", "nf-menu-footer", inner);
    this.backBtn = this._button(footer, "nf-back-button", "ESC  BACK", () => this.back());
    el("span", null, footer, "ARROWS SELECT / ENTER CONFIRM");
    this.pauseNote = el("span", "nf-offline-note", footer, "OFFLINE COMBAT TRAINING");
    this._key = (e) => this.onKey(e);
    this.root.addEventListener("keydown", this._key);
    setStyle(this.root, "display", "none");
    this.root.inert = true;
    if (!ctx.config.deterministic) {
      try {
        const settings = readSettings(localStorage.getItem(SETTINGS_KEY));
        if (settings) {
          Object.assign(ctx.config, settings);
          ctx.config.setQuality(settings.quality);
        }
      } catch {
        /* Browser storage can be unavailable in a private session. */
      }
    }
    this.syncFromConfig();
    this.selectWeapon("rifle");
    this.setPage("home", false);
  }

  _button(parent, cls, label, fn) {
    const b = el("button", cls, parent, label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }

  _row(name) {
    const row = el("div", "ow-row", this.rows);
    el("div", "name", row, name);
    return row;
  }

  _slider(name, min, max, step, apply) {
    const row = this._row(name),
      wrap = el("div", "ow-slider", row);
    el("div", "track", wrap);
    const fill = el("div", "fill", wrap),
      knob = el("div", "knob", wrap);
    const input = el("input", null, wrap);
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute("aria-label", name);
    const val = el("div", "val", row);
    const set = (v) => {
      const n = clamp(v, min, max),
        t = (n - min) / (max - min);
      input.value = String(n);
      setStyle(fill, "width", `${t * 100}%`);
      setStyle(knob, "left", `${t * 100}%`);
      setText(val, apply(n));
    };
    input.addEventListener("input", () => {
      set(Number(input.value));
      this.save();
    });
    return { input, set };
  }

  save() {
    const { quality, sensitivity, fov, invertY } = this.ctx.config;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality, sensitivity, fov, invertY }));
    } catch {
      /* Preferences remain active when persistent storage is unavailable. */
    }
  }

  setQuality(name) {
    this.ctx.config.setQuality(name);
    this.ctx.events.emit("ui:quality", { quality: name });
    this.syncFromConfig();
    this.save();
  }

  syncFromConfig() {
    const cfg = this.ctx.config;
    this.qBtns.forEach((b, i) => {
      const on = QUALITY_NAMES[i] === cfg.quality;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    this.invBtns.forEach(([b, value]) => {
      b.classList.toggle("on", value === cfg.invertY);
      b.setAttribute("aria-pressed", String(value === cfg.invertY));
    });
    this.sens.set(cfg.sensitivity / 0.0022);
    this.fov.set(cfg.fov);
  }

  selectWeapon(id) {
    const weapon = WEAPON_CATALOG.find((w) => w.id === id);
    if (!weapon || id === "pistol") return;
    this.ctx.peek("weapons")?.loadout?.select(id);
    this.selected = id;
    this.preview.select(id);
    setText(this.weaponName, weapon.label);
    setText(this.weaponCategory, weapon.category);
    setText(this.description, weapon.description);
    this.previewCanvas.setAttribute("aria-label", `${weapon.label} weapon preview`);
    this.weaponBtns.forEach((b, key) => {
      b.classList.toggle("selected", key === id);
      b.setAttribute("aria-pressed", String(key === id));
    });
    const stats = [
      weapon.id === "shotgun" ? 0.9 : weapon.damage / 110,
      weapon.rpm / 950,
      1 - weapon.adsTime / 0.65,
      Math.min(1, weapon.range / 300),
    ];
    this.specValues.forEach((fill, i) =>
      setStyle(fill, "width", `${Math.max(0.08, stats[i]) * 100}%`),
    );
  }

  setPage(page, focus = true) {
    this.page = page;
    this.root.dataset.page = page;
    this.home.hidden = page !== "home";
    this.loadout.hidden = page !== "loadout";
    this.options.hidden = page !== "options";
    this.weaponPanel.hidden = page === "options";
    for (const [id, b] of Object.entries(this.nav)) b.classList.toggle("selected", id === page);
    setText(
      this.heading,
      page === "options" ? "OPTIONS" : page === "loadout" ? "CHANGE LOADOUT" : "ATOMIC CUL-DE-SAC",
    );
    setText(
      this.status,
      page === "loadout" ? "PRIMARY WEAPON / ALL WEAPONS AVAILABLE" : "NEVADA, USA / 1963",
    );
    if (focus && this.open)
      (page === "loadout"
        ? this.weaponBtns.get(this.selected)
        : page === "options"
          ? this.qBtns[0]
          : this.nav.home
      )?.focus();
  }

  onKey(e) {
    if (!this.open) return;
    if (e.code === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.back();
      return;
    }
    if (e.target.tagName === "INPUT" && ["ArrowLeft", "ArrowRight"].includes(e.code)) return;
    const controls = [...this.root.querySelectorAll("button,input")].filter(
      (n) => !n.disabled && n.getClientRects().length > 0,
    );
    const i = controls.indexOf(document.activeElement);
    if (e.code === "Tab") {
      e.preventDefault();
      controls[focusIndex(i, e.shiftKey ? -1 : 1, controls.length)]?.focus();
    } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
      controls[
        focusIndex(i, ["ArrowUp", "ArrowLeft"].includes(e.code) ? -1 : 1, controls.length)
      ]?.focus();
    }
  }

  back() {
    if (this.page !== "home") this.setPage("home");
    else if (this.ctx.peek("match")?.started) this.close();
  }

  toggle() {
    this.open ? this.back() : this.show();
  }

  show(page = "home") {
    if (!this.open) {
      this.open = true;
      this._previousFocus = document.activeElement;
      this._prevScale = this.ctx.time.scale || 1;
      this.ctx.time.scale = 0;
      this.ctx.input.menuActive = true;
      this.ctx.input._onBlur?.();
      this.ctx.peek("player")?.setControlEnabled?.(false);
      document.exitPointerLock?.();
      this.ctx.events.emit("ui:pause", { paused: true });
    }
    this.root.inert = false;
    setStyle(this.root, "display", "");
    const match = this.ctx.peek("match");
    setText(this.nav.home, match?.started ? "RESUME GAME" : "PLAY");
    this.nav.restart.hidden = !match?.started;
    setText(this.deployHint, match?.started ? "RESPAWN WITH SELECTED LOADOUT" : "ENTER THE MATCH");
    setText(this.pauseNote, match?.started ? "MATCH PAUSED" : "OFFLINE COMBAT TRAINING");
    const pending = this.ctx.peek("weapons")?.loadout?.pending;
    if (pending) this.selectWeapon(pending);
    this.setPage(page);
  }

  deploy() {
    const match = this.ctx.peek("match");
    if (match) match.deploy();
    else this.ctx.peek("weapons")?.equipLoadout?.();
    this.close();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.inert = true;
    this.ctx.time.scale = this._prevScale ?? 1;
    this.ctx.input.menuActive = false;
    this.ctx.input._onBlur?.();
    this.ctx.peek("player")?.setControlEnabled?.(true);
    this.ctx.canvas.focus();
    this.ctx.input.requestPointerLock?.();
    this.ctx.events.emit("ui:pause", { paused: false });
  }

  update(rawDt) {
    this.shown = damp(this.shown, this.open ? 1 : 0, 14, rawDt);
    setStyle(this.root, "display", this.shown < 0.004 && !this.open ? "none" : "");
    setStyle(this.root, "pointer-events", this.open ? "auto" : "none");
    setStyle(this.root, "opacity", ease.outQuad(this.shown).toFixed(3));
    if (this.open && this.page !== "options") this.preview.update();
  }

  dispose() {
    this.preview.dispose();
    this.root.removeEventListener("keydown", this._key);
    this.root.remove();
  }
}
