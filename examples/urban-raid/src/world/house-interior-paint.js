/**
 * Canvas artwork for the cul-de-sac house interiors: 1950s wallpapers, floors,
 * rugs, laminate and book spines. Every painter is deterministic (seeded
 * xorshift), draws one seamless tile of `n` pixels, and is pure 2D canvas, so
 * the same house paints identically on every load.
 */

/** Small seeded generator so a painter never consumes the level rng. */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Speckle every pixel by up to +-amt (0..255), the fibre or grain of a surface. */
function noise(g, n, amt, seed) {
  const r = seeded(seed);
  const img = g.getImageData(0, 0, n, n);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (r() - 0.5) * amt;
    d[i] += v;
    d[i + 1] += v;
    d[i + 2] += v;
  }
  g.putImageData(img, 0, 0);
}

/** Draw `fn` at the tile and its eight wrapped neighbours so motifs tile seamlessly. */
function wrap(n, x, y, fn) {
  for (const dx of [-n, 0, n])
    for (const dy of [-n, 0, n]) {
      fn(x + dx, y + dy);
    }
}

function fill(g, n, c) {
  g.fillStyle = c;
  g.fillRect(0, 0, n, n);
}

/** Green-house kitchen: cream paper with sage sprigs and dusty-rose blooms between pinstripes. */
export function floralPaper(g, n) {
  fill(g, n, "#e3d8ba");
  g.fillStyle = "rgba(160,140,96,0.35)";
  for (let i = 0; i < 4; i++) {
    g.fillRect((i + 0.5) * (n / 4) - n / 256, 0, n / 512 + 1, n);
    g.fillRect((i + 0.5) * (n / 4) + n / 128, 0, n / 512 + 1, n);
  }
  const u = n / 4;
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 2; col++) {
      const cx = (col * 2 + (row % 2)) * u + u / 2 - u / 2,
        cy = row * u + u / 2;
      wrap(n, cx, cy, (x, y) => {
        g.strokeStyle = "#7d8a60";
        g.lineWidth = n / 300;
        g.beginPath();
        g.moveTo(x, y + u * 0.32);
        g.quadraticCurveTo(x - u * 0.12, y + u * 0.1, x, y - u * 0.05);
        g.stroke();
        g.fillStyle = "#8d996c";
        for (const [lx, ly, a] of [
          [-0.1, 0.18, -0.7],
          [0.08, 0.1, 0.6],
          [-0.06, 0.02, -0.4],
        ]) {
          g.save();
          g.translate(x + lx * u, y + ly * u);
          g.rotate(a);
          g.beginPath();
          g.ellipse(0, 0, u * 0.07, u * 0.025, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
        g.fillStyle = "#b67c70";
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.ellipse(
            x + Math.cos(a) * u * 0.05,
            y - u * 0.08 + Math.sin(a) * u * 0.05,
            u * 0.045,
            u * 0.03,
            a,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
        g.fillStyle = "#d5ad57";
        g.beginPath();
        g.arc(x, y - u * 0.08, u * 0.022, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#c79388";
        g.beginPath();
        g.arc(x + u * 0.14, y + u * 0.2, u * 0.025, 0, Math.PI * 2);
        g.fill();
      });
    }
  noise(g, n, 10, 11);
}

/** Yellow-house kitchen: whitewashed tongue-and-groove boards with a red polka dot. */
export function boardsPaper(g, n) {
  const r = seeded(21);
  const boards = 4,
    bw = n / boards;
  for (let i = 0; i < boards; i++) {
    const t = 236 + Math.floor(r() * 10);
    g.fillStyle = `rgb(${t},${t - 4},${t - 16})`;
    g.fillRect(i * bw, 0, bw, n);
    g.strokeStyle = "rgba(170,150,120,0.18)";
    g.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      const x = i * bw + r() * bw;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 3, n * 0.3, x - 3, n * 0.6, x + 1, n);
      g.stroke();
    }
    g.fillStyle = "#a69c88";
    g.fillRect(i * bw, 0, 3, n);
    g.fillStyle = "#faf6ec";
    g.fillRect(i * bw + 3, 0, 1, n);
  }
  g.fillStyle = "#b9473b";
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      wrap(n, (i + 0.5 + (j % 2) * 0.5) * (n / 4), (j + 0.5) * (n / 4), (x, y) => {
        g.beginPath();
        g.arc(x, y, n / 110, 0, Math.PI * 2);
        g.fill();
      });
    }
  noise(g, n, 8, 22);
}

/** Bump for board walls and wainscot: dark grooves every `boards` division. */
export function grooveBump(boards) {
  return (g, n) => {
    fill(g, n, "#9a9a9a");
    const bw = n / boards;
    for (let i = 0; i < boards; i++) {
      g.fillStyle = "#202020";
      g.fillRect(i * bw, 0, 4, n);
      g.fillStyle = "#c8c8c8";
      g.fillRect(i * bw + 4, 0, 2, n);
    }
    noise(g, n, 18, 31);
  };
}

function woodBoards(g, n, boards, base, seed, knots = 0) {
  const r = seeded(seed);
  const bw = n / boards;
  for (let i = 0; i < boards; i++) {
    const v = 0.85 + r() * 0.3;
    g.fillStyle = `rgb(${base[0] * v},${base[1] * v},${base[2] * v})`;
    g.fillRect(i * bw, 0, bw, n);
    for (let k = 0; k < 26; k++) {
      const x = i * bw + r() * bw,
        a = 0.08 + r() * 0.16;
      g.strokeStyle = `rgba(60,32,14,${a})`;
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      g.moveTo(x, 0);
      const w = (r() - 0.5) * bw * 0.25;
      g.bezierCurveTo(x + w, n * 0.33, x - w, n * 0.66, x, n);
      g.stroke();
    }
    for (let k = 0; k < knots; k++) {
      const x = i * bw + bw * (0.25 + r() * 0.5),
        y = r() * n,
        s = bw * (0.06 + r() * 0.08);
      wrap(n, x, y, (px, py) => {
        for (let ring = 4; ring >= 0; ring--) {
          g.fillStyle = `rgba(${70 - ring * 6},${38 - ring * 3},${16},${0.25 + (4 - ring) * 0.15})`;
          g.beginPath();
          g.ellipse(px, py, s * (1 + ring * 0.5), s * (1.6 + ring * 0.9), 0, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
    g.fillStyle = "rgba(30,16,6,0.85)";
    g.fillRect(i * bw, 0, 3, n);
    g.fillStyle = "rgba(255,230,190,0.18)";
    g.fillRect(i * bw + 3, 0, 1, n);
  }
  noise(g, n, 10, seed + 1);
}

/** Varnished oak wainscot, six boards per tile. */
export function wainscot(g, n) {
  woodBoards(g, n, 6, [150, 104, 62], 41);
}

/** Yellow-house study: knotty pine paneling. */
export function knottyPine(g, n) {
  woodBoards(g, n, 6, [196, 142, 82], 51, 1);
}

/** Yellow-house living room: atomic starbursts and boomerangs on oatmeal. */
export function atomicPaper(g, n) {
  fill(g, n, "#ddd3bb");
  const r = seeded(61);
  for (let i = 0; i < 14; i++) {
    const x = r() * n,
      y = r() * n,
      kind = i % 3,
      s = n * (0.04 + r() * 0.03),
      a0 = r() * Math.PI;
    wrap(n, x, y, (px, py) => {
      if (kind === 0) {
        g.strokeStyle = i % 2 ? "#2c2a27" : "#c4614b";
        g.fillStyle = g.strokeStyle;
        g.lineWidth = n / 600 + 0.5;
        const spokes = 8 + (i % 4);
        for (let k = 0; k < spokes; k++) {
          const a = a0 + (k / spokes) * Math.PI * 2,
            l = s * (k % 2 ? 0.6 : 1);
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
          g.stroke();
          g.beginPath();
          g.arc(px + Math.cos(a) * l, py + Math.sin(a) * l, n / 400 + 0.8, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.fillStyle = kind === 1 ? "#4c8b85" : "#c99d38";
        g.save();
        g.translate(px, py);
        g.rotate(a0);
        g.beginPath();
        g.moveTo(-s, 0);
        g.quadraticCurveTo(0, -s * 1.1, s, 0);
        g.quadraticCurveTo(s * 0.9, s * 0.3, s * 0.6, s * 0.15);
        g.quadraticCurveTo(0, -s * 0.5, -s * 0.6, s * 0.15);
        g.quadraticCurveTo(-s * 0.9, s * 0.3, -s, 0);
        g.fill();
        g.restore();
      }
    });
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = i % 2 ? "rgba(40,40,40,0.5)" : "rgba(196,97,75,0.6)";
    g.beginPath();
    g.arc(r() * n, r() * n, n / 500 + 0.6, 0, Math.PI * 2);
    g.fill();
  }
  noise(g, n, 9, 62);
}

/** Green-house bedroom: deep green damask, a mirrored scroll motif on a half-drop. */
export function damask(g, n) {
  fill(g, n, "#33473c");
  const motif = (x, y, s) => {
    g.save();
    g.translate(x, y);
    for (const m of [1, -1]) {
      g.save();
      g.scale(m, 1);
      g.beginPath();
      g.moveTo(0, -s);
      g.bezierCurveTo(s * 0.5, -s * 0.8, s * 0.2, -s * 0.3, s * 0.55, -s * 0.15);
      g.bezierCurveTo(s * 0.9, 0, s * 0.4, s * 0.5, s * 0.15, s * 0.45);
      g.bezierCurveTo(s * 0.3, s * 0.7, s * 0.1, s * 0.9, 0, s);
      g.lineTo(0, -s);
      g.fill();
      g.restore();
    }
    g.fillStyle = "#33473c";
    g.beginPath();
    g.ellipse(0, 0, s * 0.12, s * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  g.fillStyle = "#4b6352";
  wrap(n, n / 2, n / 2, (x, y) => motif(x, y, n * 0.3));
  wrap(n, 0, 0, (x, y) => motif(x, y, n * 0.3));
  g.fillStyle = "rgba(80,104,86,0.4)";
  for (let i = 0; i < n; i += 3) g.fillRect(i, 0, 1, n);
  noise(g, n, 8, 71);
}

/** Regency stripe: wide band, pinstripes and a small dot motif. */
export function stripePaper(bg, band, pin, dot) {
  return (g, n) => {
    fill(g, n, bg);
    g.fillStyle = band;
    g.fillRect(n * 0.1, 0, n * 0.3, n);
    g.fillRect(n * 0.6, 0, n * 0.3, n);
    g.fillStyle = pin;
    for (const x of [0.07, 0.43, 0.57, 0.93]) g.fillRect(n * x, 0, n / 256 + 1, n);
    g.fillStyle = dot;
    for (let j = 0; j < 4; j++) {
      for (const x of [0.0, 0.5]) {
        wrap(n, n * x, (j + (x ? 0.5 : 0)) * (n / 4), (px, py) => {
          g.beginPath();
          g.moveTo(px, py - n / 60);
          g.lineTo(px + n / 90, py);
          g.lineTo(px, py + n / 60);
          g.lineTo(px - n / 90, py);
          g.fill();
        });
      }
    }
    noise(g, n, 8, 81);
  };
}

/** Vinyl tile checkerboard with chip speckle and fine grout. Tile = 2x2 squares. */
export function checker(a, b) {
  return (g, n) => {
    const r = seeded(91);
    const h = n / 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? b : a;
        g.fillRect(i * h, j * h, h, h);
        g.globalAlpha = 0.05 + r() * 0.05;
        g.fillStyle = r() < 0.5 ? "#000" : "#fff";
        g.fillRect(i * h, j * h, h, h);
        g.globalAlpha = 1;
      }
    for (let k = 0; k < n * 3; k++) {
      g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
      g.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2);
    }
    g.fillStyle = "rgba(90,90,90,0.55)";
    g.fillRect(0, 0, n, 2);
    g.fillRect(0, h, n, 2);
    g.fillRect(0, 0, 2, n);
    g.fillRect(h, 0, 2, n);
    noise(g, n, 6, 92);
  };
}

export function checkerBump(g, n) {
  fill(g, n, "#a0a0a0");
  g.fillStyle = "#303030";
  const h = n / 2;
  g.fillRect(0, 0, n, 3);
  g.fillRect(0, h, n, 3);
  g.fillRect(0, 0, 3, n);
  g.fillRect(h, 0, 3, n);
  noise(g, n, 10, 93);
}

/** Oak strip floor: 16 planks per 1.2 m tile, staggered butt joints. Planks run along v. */
export function oakFloor(g, n) {
  const r = seeded(101);
  const cols = 12,
    cw = n / cols;
  for (let i = 0; i < cols; i++) {
    let y = -r() * n * 0.5;
    while (y < n) {
      const len = n * (0.35 + r() * 0.45),
        v = 0.82 + r() * 0.3;
      g.fillStyle = `rgb(${168 * v},${114 * v},${64 * v})`;
      g.fillRect(i * cw, y, cw, len);
      for (let k = 0; k < 7; k++) {
        const x = i * cw + r() * cw;
        g.strokeStyle = `rgba(70,38,16,${0.1 + r() * 0.15})`;
        g.lineWidth = 0.6 + r();
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y + len);
        g.stroke();
      }
      g.fillStyle = "rgba(40,22,8,0.8)";
      g.fillRect(i * cw, y, cw, 2);
      y += len;
    }
    g.fillStyle = "rgba(40,22,8,0.75)";
    g.fillRect(i * cw, 0, 2, n);
  }
  // Wrap the first row's joints: repaint the top seam so the tile repeats.
  noise(g, n, 9, 102);
}

export function oakBump(g, n) {
  fill(g, n, "#a0a0a0");
  const cols = 12,
    cw = n / cols;
  g.fillStyle = "#383838";
  for (let i = 0; i < cols; i++) g.fillRect(i * cw, 0, 3, n);
  noise(g, n, 14, 103);
}

/** Tartan carpet for the green-house bedroom. */
export function plaidCarpet(g, n) {
  fill(g, n, "#6f2c29");
  g.fillStyle = "rgba(38,66,50,0.75)";
  g.fillRect(0, n * 0.1, n, n * 0.3);
  g.fillRect(n * 0.1, 0, n * 0.3, n);
  g.fillStyle = "rgba(20,30,26,0.35)";
  g.fillRect(0, n * 0.6, n, n * 0.12);
  g.fillRect(n * 0.6, 0, n * 0.12, n);
  g.fillStyle = "rgba(205,168,80,0.6)";
  g.fillRect(0, n * 0.5, n, n / 128 + 1);
  g.fillRect(n * 0.5, 0, n / 128 + 1, n);
  noise(g, n, 40, 111);
}

/** Plain broadloom carpet with heavy fibre speckle. */
export function broadloom(color) {
  return (g, n) => {
    fill(g, n, color);
    noise(g, n, 34, 121);
  };
}

/** Oval braided rug: concentric braid rings, drawn for a unit-circle UV layout. */
export function braidedRug(colors) {
  return (g, n) => {
    fill(g, n, colors[0]);
    const rings = 22;
    for (let i = rings; i > 0; i--) {
      const rr = (i / rings) * n * 0.5;
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.arc(n / 2, n / 2, rr, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = n / 400 + 0.5;
      g.setLineDash([n / 120, n / 160]);
      g.beginPath();
      g.arc(n / 2, n / 2, rr - n / 90, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    noise(g, n, 24, 131);
  };
}

/** Rectangular wool rug with border bands and a central medallion (UV 0..1). */
export function patternRug(field, border, accent) {
  return (g, n) => {
    fill(g, n, border);
    g.fillStyle = accent;
    g.fillRect(n * 0.05, n * 0.05, n * 0.9, n * 0.9);
    g.fillStyle = field;
    g.fillRect(n * 0.09, n * 0.09, n * 0.82, n * 0.82);
    g.fillStyle = accent;
    g.save();
    g.translate(n / 2, n / 2);
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2,
        rr = k % 2 ? n * 0.11 : n * 0.2;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.fill();
    g.fillStyle = border;
    g.beginPath();
    g.arc(0, 0, n * 0.06, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = accent;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        const x = n * (0.16 + i * 0.136),
          y = n * (0.16 + j * 0.136);
        if (Math.hypot(x - n / 2, y - n / 2) < n * 0.25) continue;
        g.beginPath();
        g.moveTo(x, y - n / 70);
        g.lineTo(x + n / 70, y);
        g.lineTo(x, y + n / 70);
        g.lineTo(x - n / 70, y);
        g.fill();
      }
    noise(g, n, 26, 141);
  };
}

/** Boomerang laminate counter top. */
export function formica(g, n) {
  fill(g, n, "#e8e0cc");
  const r = seeded(151);
  const cols = ["rgba(150,170,175,0.55)", "rgba(205,150,140,0.5)", "rgba(120,120,120,0.35)"];
  for (let i = 0; i < 22; i++) {
    const x = r() * n,
      y = r() * n,
      s = n * (0.035 + r() * 0.03),
      a = r() * Math.PI * 2,
      c = cols[i % 3];
    wrap(n, x, y, (px, py) => {
      g.fillStyle = c;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-s, 0);
      g.quadraticCurveTo(0, -s, s, 0);
      g.quadraticCurveTo(0, -s * 0.45, -s, 0);
      g.fill();
      g.restore();
    });
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = i % 3 ? "rgba(185,150,70,0.8)" : "rgba(60,60,60,0.5)";
    g.fillRect(r() * n, r() * n, 1.5, 1.5);
  }
  noise(g, n, 5, 152);
}

/** Book spines on transparent ground, bottom-aligned, for a 0.8 m wide shelf tile. */
export function bookSpines(g, n) {
  g.clearRect(0, 0, n, n);
  const r = seeded(161);
  const pal = [
    "#7a2e28",
    "#2e4a6b",
    "#3f5b3a",
    "#8c6a2f",
    "#5b3b5e",
    "#c9b98f",
    "#22303a",
    "#9a4a2c",
  ];
  let x = 0;
  while (x < n - 4) {
    const w = Math.min(n - x, n * (0.03 + r() * 0.035)),
      h = n * (0.68 + r() * 0.3);
    g.fillStyle = pal[Math.floor(r() * pal.length)] ?? "#7a2e28";
    g.fillRect(x, n - h, w - 1, h);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(x + w - 3, n - h, 2, h);
    g.fillStyle = "rgba(214,182,96,0.85)";
    g.fillRect(x + 2, n - h + h * 0.12, w - 5, 2);
    g.fillRect(x + 2, n - h * 0.18, w - 5, 2);
    g.fillStyle = "rgba(240,230,205,0.55)";
    g.fillRect(x + w * 0.3, n - h * 0.7, w * 0.3, h * 0.35);
    x += w;
  }
}

/** Red gingham for kitchen curtains. */
export function gingham(color) {
  return (g, n) => {
    fill(g, n, "#f1ece0");
    g.fillStyle = color;
    g.globalAlpha = 0.55;
    g.fillRect(0, 0, n / 2, n);
    g.fillRect(0, 0, n, n / 2);
    g.globalAlpha = 1;
    noise(g, n, 16, 171);
  };
}

/** Speaker cloth on the console television. */
export function grilleCloth(g, n) {
  fill(g, n, "#8a7650");
  g.fillStyle = "rgba(255,230,170,0.25)";
  for (let i = 0; i < n; i += 4) g.fillRect(i, 0, 2, n);
  g.fillStyle = "rgba(40,28,10,0.25)";
  for (let i = 0; i < n; i += 4) g.fillRect(0, i, n, 2);
}

/** Chenille bedspread: tufted rows on pale pink. */
export function chenille(g, n) {
  fill(g, n, "#dcb3ad");
  g.fillStyle = "rgba(250,236,232,0.75)";
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 12; j++) {
      g.beginPath();
      g.arc((i + 0.5 + (j % 2) * 0.5) * (n / 6), (j + 0.5) * (n / 12), n / 70, 0, Math.PI * 2);
      g.fill();
    }
  noise(g, n, 22, 181);
}

/** Pegboard for the garage workbench. */
export function pegboard(g, n) {
  fill(g, n, "#9c7b55");
  g.fillStyle = "#3b2c1c";
  const s = n / 16;
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 16; j++) {
      g.beginPath();
      g.arc((i + 0.5) * s, (j + 0.5) * s, s * 0.14, 0, Math.PI * 2);
      g.fill();
    }
  noise(g, n, 16, 191);
}

/** Oil landscape: desert mesas at dusk, the period's favourite living-room print. */
export function mesaPainting(g, n) {
  const sky = g.createLinearGradient(0, 0, 0, n * 0.62);
  sky.addColorStop(0, "#3d4f6e");
  sky.addColorStop(0.6, "#d58b5a");
  sky.addColorStop(1, "#f1c27a");
  g.fillStyle = sky;
  g.fillRect(0, 0, n, n);
  g.fillStyle = "#6f3a2a";
  g.beginPath();
  g.moveTo(0, n * 0.62);
  g.lineTo(n * 0.1, n * 0.62);
  g.lineTo(n * 0.14, n * 0.42);
  g.lineTo(n * 0.36, n * 0.42);
  g.lineTo(n * 0.4, n * 0.62);
  g.lineTo(n * 0.58, n * 0.62);
  g.lineTo(n * 0.62, n * 0.5);
  g.lineTo(n * 0.78, n * 0.5);
  g.lineTo(n * 0.82, n * 0.62);
  g.lineTo(n, n * 0.62);
  g.lineTo(n, n);
  g.lineTo(0, n);
  g.fill();
  const ground = g.createLinearGradient(0, n * 0.62, 0, n);
  ground.addColorStop(0, "#a8653c");
  ground.addColorStop(1, "#5a3420");
  g.fillStyle = ground;
  g.fillRect(0, n * 0.64, n, n);
  g.fillStyle = "#3a5236";
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.ellipse(
      n * (0.08 + i * 0.11),
      n * (0.78 + (i % 3) * 0.05),
      n * 0.025,
      n * 0.012,
      0,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  noise(g, n, 18, 201);
}

/** Still life: flowers in a vase. */
export function flowerPainting(g, n) {
  fill(g, n, "#2c3a33");
  g.fillStyle = "#6b4a2c";
  g.fillRect(0, n * 0.78, n, n);
  g.fillStyle = "#b9b2a0";
  g.beginPath();
  g.ellipse(n / 2, n * 0.68, n * 0.11, n * 0.15, 0, 0, Math.PI * 2);
  g.fill();
  const r = seeded(211);
  const c = ["#c4453a", "#e2b04a", "#e8ddc8", "#b56a8a"];
  for (let i = 0; i < 18; i++) {
    const x = n * (0.3 + r() * 0.4),
      y = n * (0.2 + r() * 0.3);
    g.strokeStyle = "#4d6b3d";
    g.lineWidth = n / 200;
    g.beginPath();
    g.moveTo(n / 2, n * 0.58);
    g.lineTo(x, y);
    g.stroke();
    g.fillStyle = c[i % 4] ?? "#c4453a";
    g.beginPath();
    g.arc(x, y, n * (0.03 + r() * 0.025), 0, Math.PI * 2);
    g.fill();
  }
  noise(g, n, 20, 212);
}

/** A wall calendar page. */
export function calendar(g, n) {
  fill(g, n, "#efe8d6");
  g.fillStyle = "#a33a2f";
  g.fillRect(0, 0, n, n * 0.42);
  g.fillStyle = "#e9c46a";
  g.beginPath();
  g.arc(n * 0.5, n * 0.22, n * 0.13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#222";
  g.font = `bold ${n * 0.08}px serif`;
  g.textAlign = "center";
  g.fillText("OCTOBER 1958", n / 2, n * 0.53);
  g.font = `${n * 0.045}px serif`;
  for (let i = 0; i < 31; i++) {
    g.fillText(String(i + 1), n * (0.12 + (i % 7) * 0.127), n * (0.62 + Math.floor(i / 7) * 0.08));
  }
}

/**
 * Flat interior paint over skim plaster: the base colour with a faint trowel
 * mottle, so a large wall reads as a painted surface under raking light.
 */
export function flatPaint(hex) {
  return (g, n) => {
    fill(g, n, hex);
    const r = seeded(211);
    for (let i = 0; i < 60; i++) {
      const x = r() * n,
        y = r() * n,
        rad = n * (0.05 + r() * 0.12);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const a = 0.025 + r() * 0.03;
      grd.addColorStop(0, r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      for (const ox of [-n, 0, n])
        for (const oy of [-n, 0, n]) {
          g.save();
          g.translate(ox, oy);
          g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
          g.restore();
        }
    }
    noise(g, n, 6, 212);
  };
}
