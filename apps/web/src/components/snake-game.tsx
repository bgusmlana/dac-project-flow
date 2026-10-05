import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Game ular kecil untuk panel samping halaman login.
 * - Mode demo: ular jalan sendiri (mencari makanan) supaya panel terlihat hidup.
 * - Klik panel → main sendiri dengan panah / WASD. Tombol hanya ditangkap saat panel aktif (fokus),
 *   jadi tidak mengganggu mengetik username & password.
 */

const CELL = 22;
const TICK_MS = 110;

type P = { x: number; y: number };
type Mode = 'demo' | 'play' | 'over';

const DIRS: Record<string, P> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

function readBest(): number {
  try {
    return Number(localStorage.getItem('manpro.snake.best') ?? 0) || 0;
  } catch {
    return 0;
  }
}
function saveBest(n: number) {
  try {
    localStorage.setItem('manpro.snake.best', String(n));
  } catch {
    /* penyimpanan browser tidak tersedia: abaikan */
  }
}

export function SnakeGame({ className }: { className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('demo');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);

  // Semua state game di ref supaya loop tidak ikut re-render.
  const g = useRef({
    cols: 20,
    rows: 20,
    snake: [] as P[],
    dir: { x: 1, y: 0 } as P,
    queue: [] as P[],
    food: { x: 5, y: 5 } as P,
    mode: 'demo' as Mode,
    score: 0,
    overAt: 0,
  });

  useEffect(() => {
    const box = boxRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = g.current;

    const color = (v: string) => getComputedStyle(box).getPropertyValue(v).trim() || '#888';
    let colors = { snake: color('--sidebar-primary'), head: color('--sidebar-primary-foreground'), food: '#f59e0b', dot: color('--sidebar-foreground') };

    const occupied = (p: P, body = s.snake) => body.some((b) => b.x === p.x && b.y === p.y);
    const inside = (p: P) => p.x >= 0 && p.y >= 0 && p.x < s.cols && p.y < s.rows;

    function placeFood() {
      for (let i = 0; i < 500; i++) {
        const f = { x: Math.floor(Math.random() * s.cols), y: Math.floor(Math.random() * s.rows) };
        if (!occupied(f)) {
          s.food = f;
          return;
        }
      }
    }

    function reset(mode: Mode) {
      const cx = Math.floor(s.cols / 2);
      const cy = Math.floor(s.rows / 2);
      s.snake = [
        { x: cx, y: cy },
        { x: cx - 1, y: cy },
        { x: cx - 2, y: cy },
        { x: cx - 3, y: cy },
      ];
      s.dir = { x: 1, y: 0 };
      s.queue = [];
      s.score = 0;
      s.mode = mode;
      setScore(0);
      setMode(mode);
      placeFood();
    }

    function resize() {
      const r = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.max(10, Math.floor(r.width / CELL));
      const rows = Math.max(10, Math.floor(r.height / CELL));
      if (cols !== s.cols || rows !== s.rows || s.snake.length === 0) {
        s.cols = cols;
        s.rows = rows;
        reset(s.mode === 'play' ? 'play' : 'demo');
      }
      colors = { snake: color('--sidebar-primary'), head: color('--sidebar-primary-foreground'), food: '#f59e0b', dot: color('--sidebar-foreground') };
      draw();
    }

    /** Banyaknya petak kosong yang bisa dicapai dari p (untuk demo: hindari jalan buntu). */
    function space(p: P, body: P[]) {
      const seen = new Set<string>([`${p.x},${p.y}`]);
      const stack = [p];
      const blocked = new Set(body.map((b) => `${b.x},${b.y}`));
      while (stack.length && seen.size < 150) {
        const c = stack.pop()!;
        for (const d of [DIRS.ArrowUp!, DIRS.ArrowDown!, DIRS.ArrowLeft!, DIRS.ArrowRight!]) {
          const n = { x: c.x + d.x, y: c.y + d.y };
          const k = `${n.x},${n.y}`;
          if (inside(n) && !blocked.has(k) && !seen.has(k)) {
            seen.add(k);
            stack.push(n);
          }
        }
      }
      return seen.size;
    }

    function autoPilot() {
      const head = s.snake[0]!;
      const options = [DIRS.ArrowUp!, DIRS.ArrowDown!, DIRS.ArrowLeft!, DIRS.ArrowRight!]
        .filter((d) => !(d.x === -s.dir.x && d.y === -s.dir.y))
        .map((d) => {
          const n = { x: head.x + d.x, y: head.y + d.y };
          const body = s.snake.slice(0, -1);
          if (!inside(n) || occupied(n, body)) return null;
          const room = space(n, [n, ...body]);
          const dist = Math.abs(n.x - s.food.x) + Math.abs(n.y - s.food.y);
          return { d, score: (room < s.snake.length + 2 ? -1000 : 0) - dist + Math.min(room, 40) * 0.05 };
        })
        .filter((o): o is { d: P; score: number } => o !== null)
        .sort((a, b) => b.score - a.score);
      if (options[0]) s.dir = options[0].d;
    }

    function step() {
      if (s.mode === 'over') {
        return;
      }
      if (s.mode === 'demo') autoPilot();
      else if (s.queue.length) s.dir = s.queue.shift()!;

      const head = s.snake[0]!;
      const next = { x: head.x + s.dir.x, y: head.y + s.dir.y };
      const eating = next.x === s.food.x && next.y === s.food.y;
      const body = eating ? s.snake : s.snake.slice(0, -1);
      if (!inside(next) || occupied(next, body)) {
        if (s.mode === 'demo') {
          reset('demo');
        } else {
          s.mode = 'over';
          s.overAt = Date.now();
          setMode('over');
          if (s.score > readBest()) {
            saveBest(s.score);
            setBest(s.score);
          }
        }
        return;
      }
      s.snake = [next, ...body];
      if (eating) {
        if (s.mode === 'play') {
          s.score += 1;
          setScore(s.score);
        }
        placeFood();
      }
    }

    function draw() {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);
      const ox = (w - s.cols * CELL) / 2;
      const oy = (h - s.rows * CELL) / 2;
      // Titik-titik latar
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = colors.dot;
      for (let x = 0; x < s.cols; x++) for (let y = 0; y < s.rows; y++) ctx.fillRect(ox + x * CELL + CELL / 2 - 1, oy + y * CELL + CELL / 2 - 1, 2, 2);
      ctx.globalAlpha = 1;
      // Makanan
      ctx.fillStyle = colors.food;
      ctx.beginPath();
      ctx.arc(ox + s.food.x * CELL + CELL / 2, oy + s.food.y * CELL + CELL / 2, CELL * 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Ular
      s.snake.forEach((p, i) => {
        ctx.globalAlpha = s.mode === 'demo' ? 0.55 : 1;
        ctx.fillStyle = i === 0 ? colors.head : colors.snake;
        const pad = i === 0 ? 2 : 3;
        ctx.beginPath();
        ctx.roundRect(ox + p.x * CELL + pad, oy + p.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 5);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    // Timer biasa (bukan requestAnimationFrame): jalan stabil, dan berhenti sendiri saat tab tidak dilihat.
    let tick = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (s.mode === 'demo' && reduceMotion) return;
      tick++;
      if (s.mode === 'demo' && tick % 4 === 3) return; // demo sedikit lebih lambat
      step();
      draw();
    }, TICK_MS);

    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((key === ' ' || key === 'Enter') && s.mode !== 'play') {
        e.preventDefault();
        if (s.mode === 'demo' || Date.now() - s.overAt > 300) reset('play');
        return;
      }
      const d = DIRS[key];
      if (!d) return;
      e.preventDefault();
      if (s.mode !== 'play') {
        reset('play');
        return;
      }
      const lastDir = s.queue[s.queue.length - 1] ?? s.dir;
      if (d.x === -lastDir.x && d.y === -lastDir.y) return; // tidak boleh balik arah
      if (s.queue.length < 3) s.queue.push(d);
    };
    const onClick = () => {
      box.focus();
      if (s.mode !== 'play') reset('play');
    };
    // Kalau panel ditinggal (klik ke form), game dijeda kembali ke demo.
    const onBlur = () => {
      if (s.mode === 'play') {
        if (s.score > readBest()) {
          saveBest(s.score);
          setBest(s.score);
        }
        reset('demo');
      }
    };
    box.addEventListener('keydown', onKey);
    box.addEventListener('click', onClick);
    box.addEventListener('blur', onBlur);
    return () => {
      window.clearInterval(timer);
      ro.disconnect();
      box.removeEventListener('keydown', onKey);
      box.removeEventListener('click', onClick);
      box.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      role="application"
      aria-label="Game ular. Klik lalu gunakan tombol panah untuk bermain."
      className={cn('relative cursor-pointer overflow-hidden outline-none select-none', className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
        {mode === 'play' && (
          <span className="rounded-full bg-sidebar-accent/80 px-3 py-1 text-xs font-medium text-sidebar-foreground tabular-nums backdrop-blur">
            Skor {score} · Terbaik {Math.max(best, score)}
          </span>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
        {mode === 'demo' && (
          <span className="rounded-full bg-sidebar-accent/80 px-4 py-1.5 text-xs text-sidebar-foreground/80 backdrop-blur">
            Klik untuk main · ← ↑ → ↓{best > 0 ? ` · Skor terbaik ${best}` : ''}
          </span>
        )}
        {mode === 'over' && (
          <span className="rounded-full bg-sidebar-accent/90 px-4 py-1.5 text-xs font-medium text-sidebar-foreground backdrop-blur">
            Game over · Skor {score} · Klik / tekan panah untuk ulang
          </span>
        )}
      </div>
    </div>
  );
}
