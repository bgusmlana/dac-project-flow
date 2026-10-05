import { ArrowRight, BookOpen, ChevronDown, CircleHelp, RotateCcw, Search, Sparkles } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui-extra';
import { useMe } from '@/hooks/use-me';
import { cn } from '@/lib/utils';
import { FAQ, FLOW, GUIDES, TERMS, type Guide } from './help-content';

/** Tampilkan teks dengan **tebal** sederhana. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <b key={i} className="font-semibold text-foreground">
            {p}
          </b>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function matches(q: string, ...texts: string[]) {
  if (!q) return true;
  const s = q.toLowerCase();
  return texts.some((t) => t.toLowerCase().includes(s));
}

function GuideCard({ g, mine, open, onToggle }: { g: Guide; mine: boolean; open: boolean; onToggle: () => void }) {
  return (
    <Card id={g.id} className={cn('scroll-mt-4 gap-0 py-0', mine && 'ring-primary/40')}>
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60" onClick={onToggle} aria-expanded={open}>
        <BookOpen className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{g.title}</div>
          <div className="text-xs text-muted-foreground">Dikerjakan oleh: {g.who}</div>
        </div>
        {mine && <Badge>Tugas Anda</Badge>}
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t px-4 py-4">
          <ol className="grid gap-3">
            {g.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                <span className="pt-0.5">
                  <Rich text={s} />
                </span>
              </li>
            ))}
          </ol>
          {g.tips && (
            <div className="mt-4 rounded-lg bg-accent p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-accent-foreground">
                <Sparkles className="size-3.5" /> Tips
              </div>
              <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
                {g.tips.map((t, i) => (
                  <li key={i}>
                    <Rich text={t} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function HelpPage() {
  const me = useMe().data!;
  const location = useLocation();
  const [q, setQ] = useState('');
  const hash = location.hash.slice(1);
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const mine = GUIDES.filter((g) => g.isMine(me)).map((g) => g.id);
    // Untuk user divisi, langsung buka panduan pekerjaannya.
    return new Set(hash ? [hash] : mine.length <= 2 ? mine : []);
  });

  useEffect(() => {
    if (!hash) return;
    setOpenIds((s) => new Set(s).add(hash));
    setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [hash]);

  const toggle = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const guides = GUIDES.filter((g) => matches(q, g.title, g.who, ...g.steps, ...(g.tips ?? [])));
  const myGuides = guides.filter((g) => g.isMine(me));
  const otherGuides = guides.filter((g) => !g.isMine(me));
  const faq = FAQ.filter((f) => matches(q, f.q, f.a));
  const terms = TERMS.filter((t) => matches(q, t.term, t.meaning));

  return (
    <div className="grid gap-6">
      <PageHeader title="Pusat Bantuan" description="Penjelasan alur kerja, panduan langkah demi langkah untuk tiap divisi, dan jawaban atas pertanyaan umum." />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" placeholder="Cari bantuan, misalnya: koli, rework, lupa password…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!q && (
        <Card>
          <CardHeader>
            <CardTitle>Alur kerja unit</CardTitle>
            <CardDescription>
              Setiap unit (satu perangkat, dikenali dari serial number-nya) berjalan dari kiri ke kanan. Setiap divisi hanya mengerjakan tahapnya sendiri, lalu unit otomatis pindah ke
              antrian divisi berikutnya.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FLOW.map((f, i) => (
                <li key={f.id}>
                  <a
                    href={`#${f.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenIds((s) => new Set(s).add(f.id));
                      setTimeout(() => document.getElementById(f.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                    }}
                    className={cn('flex h-full flex-col rounded-lg border bg-card p-3 transition-colors hover:border-primary hover:bg-accent', f.optional && 'border-dashed')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                      <span className="font-semibold">{f.title}</span>
                      {f.optional && <span className="text-[11px] text-muted-foreground">(produk tertentu)</span>}
                    </div>
                    <div className="mt-1.5 text-xs font-medium text-primary">{f.who}</div>
                    <p className="mt-1 flex-1 text-xs text-muted-foreground">{f.does}</p>
                    <p className="mt-2 flex items-start gap-1 border-t pt-2 text-xs">
                      <ArrowRight className="mt-0.5 size-3 shrink-0 text-primary" />
                      {f.result}
                    </p>
                  </a>
                </li>
              ))}
              <li className="flex flex-col items-center justify-center rounded-lg border border-green-600/30 bg-green-50 p-3 text-center dark:bg-green-950/30">
                <span className="font-semibold text-green-700 dark:text-green-400">Selesai</span>
                <span className="text-xs text-muted-foreground">Unit sampai di client. Project selesai otomatis setelah semua unitnya selesai.</span>
              </li>
            </ol>
            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <div className="flex gap-2 rounded-lg bg-muted p-3">
                <RotateCcw className="mt-0.5 size-4 shrink-0 text-orange-500" />
                <span>
                  <b className="text-foreground">Rework:</b> unit yang gagal QC dikembalikan ke Assembling atau Aktivasi, lalu melewati QC lagi.
                </span>
              </div>
              <div className="flex gap-2 rounded-lg bg-muted p-3">
                <CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <b className="text-foreground">Tidak semua tahap dilalui:</b> Jenis Produk menentukan tahap wajib, opsional, dan dilewati. Contohnya, laptop biasanya langsung ke Aktivasi.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {myGuides.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-base font-semibold">Panduan untuk Anda</h2>
          {myGuides.map((g) => (
            <GuideCard key={g.id} g={g} mine={me.role !== 'super_admin' && me.role !== 'manager'} open={!!q || openIds.has(g.id)} onToggle={() => toggle(g.id)} />
          ))}
        </section>
      )}

      {otherGuides.length > 0 && (
        <section className="grid gap-3">
          <div>
            <h2 className="text-base font-semibold">Panduan divisi lain</h2>
            <p className="text-sm text-muted-foreground">Untuk memahami apa yang terjadi pada unit sebelum dan sesudah sampai di divisi Anda.</p>
          </div>
          {otherGuides.map((g) => (
            <GuideCard key={g.id} g={g} mine={false} open={!!q || openIds.has(g.id)} onToggle={() => toggle(g.id)} />
          ))}
        </section>
      )}

      {faq.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-base font-semibold">Pertanyaan umum</h2>
          <div className="grid gap-2">
            {faq.map((f) => (
              <details key={f.q} className="group rounded-xl bg-card ring-1 ring-foreground/10" open={!!q}>
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60">
                  <CircleHelp className="size-4 shrink-0 text-primary" />
                  <span className="flex-1">{f.q}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                  <Rich text={f.a} />
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      {terms.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-base font-semibold">Daftar istilah</h2>
          <Card className="py-0">
            <dl className="divide-y">
              {terms.map((t) => (
                <div key={t.term} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt className="font-medium">{t.term}</dt>
                  <dd className="text-muted-foreground">{t.meaning}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      )}

      {q && guides.length === 0 && faq.length === 0 && terms.length === 0 && (
        <p className="text-sm text-muted-foreground">Tidak ada bantuan yang cocok dengan "{q}". Coba kata lain, atau tanyakan ke Leader divisi Anda.</p>
      )}
    </div>
  );
}
