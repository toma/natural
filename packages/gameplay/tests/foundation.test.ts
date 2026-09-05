import { expect, test } from "bun:test";
import { Localizer } from "../src/localization.ts";
import { WorldStreamer } from "../src/streaming.ts";
import { AudioSource } from "../src/audio.ts";
import { UiControl } from "../src/ui.ts";

test("localization formats fallbacks and plurals", () => {
  const localizer = new Localizer("fr").add("en", {
    greeting: "Hello {name}",
    apples: { zero: "No apples", one: "{count} apple", other: "{count} apples" },
  });
  expect(localizer.translate("greeting", { name: "Ada" })).toBe("Hello Ada");
  expect(localizer.translate("apples", { count: 0 })).toBe("No apples");
  expect(localizer.translate("apples", { count: 2 })).toBe("2 apples");
  expect(localizer.translate("missing")).toBe("missing");
  localizer.add("fr", { greeting: "Bonjour {name}" });
  localizer.setLocale("fr");
  expect(localizer.locale).toBe("fr");
  expect(localizer.translate("greeting", { name: "Ada" })).toBe("Bonjour Ada");
});

test("audio and UI components reject unsafe runtime values", () => {
  expect(AudioSource.create({ volume: 0.25 }).volume).toBe(0.25);
  expect(() => AudioSource.create({ volume: Number.NaN })).toThrow("Invalid value");
  expect(() => AudioSource.create({ volume: 2 })).toThrow("Invalid value");
  expect(UiControl.create({ kind: "button", text: "Play" })).toMatchObject({
    kind: "button",
    text: "Play",
  });
  expect(() => UiControl.create({ style: { padding: -1 } })).toThrow("Invalid value");
});

test("world streaming loads and unloads cells with hysteresis", async () => {
  const events: string[] = [];
  const streamer = new WorldStreamer({ loadRadius: 10, unloadRadius: 15, maxConcurrentLoads: 1 });
  streamer.add({
    key: "origin",
    center: { x: 0, y: 0, z: 0 },
    load: async () => {
      events.push("load");
    },
    unload: () => {
      events.push("unload");
    },
  });
  await streamer.update([{ x: 0, y: 0, z: 0 }]);
  expect(streamer.states()).toEqual({ origin: "loaded" });
  await streamer.update([{ x: 12, y: 0, z: 0 }]);
  expect(streamer.states()).toEqual({ origin: "loaded" });
  await streamer.update([{ x: 20, y: 0, z: 0 }]);
  expect(streamer.states()).toEqual({ origin: "unloaded" });
  expect(events).toEqual(["load", "unload"]);
  await streamer.dispose();
  expect(() =>
    streamer.add({
      key: "origin",
      center: { x: 0, y: 0, z: 0 },
      load: async () => undefined,
      unload: () => undefined,
    }),
  ).toThrow("disposed");
  expect(() => new WorldStreamer({ loadRadius: 10, unloadRadius: 5 })).toThrow("radii");
  expect(() => new WorldStreamer({ loadRadius: 10, maxConcurrentLoads: 0 })).toThrow(
    "positive integer",
  );
});

test("world streaming drains in-flight loads during disposal", async () => {
  let finish: (() => void) | undefined;
  let unloads = 0;
  const streamer = new WorldStreamer({ loadRadius: 10 });
  streamer.add({
    key: "pending",
    center: { x: 0, y: 0, z: 0 },
    load: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    unload: () => {
      unloads += 1;
    },
  });
  const updating = streamer.update([{ x: 0, y: 0, z: 0 }]);
  await Bun.sleep(0);
  const disposing = streamer.dispose();
  finish?.();
  await Promise.all([updating, disposing]);
  expect(streamer.disposed).toBe(true);
  expect(streamer.states()).toEqual({ pending: "unloaded" });
  expect(unloads).toBe(1);
  expect(streamer.update([])).rejects.toThrow("disposed");
});
