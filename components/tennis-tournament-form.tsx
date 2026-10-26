"use client";
import { useState } from "react";
import { createTournament } from "@/app/vytvorit-turnaj/actions";
import { updateTournament } from "@/app/turnaje/[slug]/upravit/actions";
import type { TournamentEditSource, TournamentRepeatSource } from "@/lib/tournaments";
import { TENNIS_SCORING, TENNIS_SYSTEMS, type TennisSettings } from "@/lib/tennis";
import { REGIONS, SURFACES, type TournamentCountry } from "@/lib/tournament-location";
import { createTennisPlan, recommendTennisSystem } from "@/lib/tennis-plan";
import { suggestedGroupSizes } from "@/lib/tournament-groups";

export function TennisTournamentForm({ repeatSource, editSource }: { repeatSource?: TournamentRepeatSource | null; editSource?: TournamentEditSource | null }) {
  const source = editSource ?? repeatSource;
  const initial = source?.formatSettings?.tennis;
  const [system, setSystem] = useState<string>(initial?.system ?? "recommended");
  const [count, setCount] = useState(source?.capacity ?? 8);
  const [courts, setCourts] = useState(source?.playingFields ?? 2);
  const [duration, setDuration] = useState(source?.matchDuration ?? 40);
  const [start, setStart] = useState(source?.startTime ?? "09:00");
  const [country, setCountry] = useState<TournamentCountry>(source?.country ?? "Slovensko");
  const [players, setPlayers] = useState(source?.customTeams.join("\n") ?? "");
  const [qualifiers, setQualifiers] = useState(initial?.qualifiers ?? 2);
  const [lunch, setLunch] = useState(source?.lunchBreak ?? false);
  const [lunchStart, setLunchStart] = useState(source?.lunchStart ?? "12:00");
  const [lunchMinutes, setLunchMinutes] = useState(source?.lunchDuration ?? 45);
  const [end, setEnd] = useState(source?.preferredFinish ?? "18:00");
  const recommended = recommendTennisSystem({ teamNames: [], teamCount: count, fieldCount: courts, matchMinutes: duration, startTime: start, lunchBreak: lunch, lunchStart, lunchDuration: lunchMinutes, gameSystem: "round_robin", qualifiersPerGroup: qualifiers }, end);
  const effective = system === "recommended" ? recommended : system as TennisSettings["system"];
  const names = players.split("\n").map((p) => p.trim()).filter(Boolean);
  let summary: ReturnType<typeof createTennisPlan> | null = null; let problem = "";
  try {
    if (!Number.isInteger(count) || count < 2 || count > 64 || !Number.isInteger(courts) || courts < 1 || courts > 32 || duration < 5 || duration > 240) throw new Error("Zadajte 2 až 64 hráčov alebo dvojíc, platný počet kurtov a odhad trvania.");
    if (names.length > count || new Set(names).size !== names.length) throw new Error("Počet mien nesmie prekročiť kapacitu a označenia musia byť odlišné.");
    summary = createTennisPlan({ teamNames: names, teamCount: count, fieldCount: courts, matchMinutes: duration, startTime: start, lunchBreak: lunch, lunchStart, lunchDuration: lunchMinutes, gameSystem: effective === "groups_playoff" ? "groups_playoff" : "round_robin" }, { system: effective, scoring: "set6", discipline: "singles", noAd: false, groupSizes: effective === "round_robin" ? [count] : suggestedGroupSizes(count), qualifiers });
  } catch (e) { problem = e instanceof Error ? e.message : "Skontrolujte parametre."; }
  return <form action={editSource ? updateTournament : createTournament} className="rounded-3xl border bg-white p-6 shadow-card sm:p-10" onSubmit={(event) => { if (editSource?.hasResults && !window.confirm("Zmena športu, systému, hráčov alebo bodovania môže vymazať doterajšie výsledky. Pokračovať?")) event.preventDefault(); }}>
    <input name="sport" type="hidden" value="Tenis" /><input name="formatChoice" type="hidden" value={`tennis_${system}`} /><input name="slug" type="hidden" value={editSource?.slug ?? ""} /><input name="confirmReset" type="hidden" value="yes" />
    {names.map((name) => <input key={name} type="hidden" name="customTeams" value={name} />)}
    {source && <p className="mb-6 rounded-xl bg-arena-50 p-4 text-sm">{editSource ? "Upravujete tenisový turnaj." : `Opakujete turnaj ${source.name}. Zvoľte nový dátum.`}</p>}
    <div className="grid gap-5 sm:grid-cols-2">
      <Input label="Názov turnaja" name="name" value={source?.name} /><Input label="Kategória" name="category" value={source?.category} />
      <Input label="Dátum" name="date" type="date" value={editSource?.eventDate} /><Input label="Miesto" name="place" value={source?.place} />
      <label><span className="label">Krajina</span><select className="field" name="country" value={country} onChange={(e) => setCountry(e.target.value as TournamentCountry)}>{Object.keys(REGIONS).map((c) => <option key={c}>{c}</option>)}</select></label>
      <label><span className="label">Kraj</span><select key={country} className="field" name="region" required defaultValue={source?.country === country ? source.region ?? "" : ""}><option value="">Vyberte kraj</option>{REGIONS[country].map((r) => <option key={r}>{r}</option>)}</select></label>
      <label><span className="label">Povrch</span><select className="field" name="surface" defaultValue={source?.surface ?? "Antuka"}>{SURFACES.filter((s) => !["Ľadová plocha", "Umelý trávnik"].includes(s)).map((s) => <option key={s}>{s}</option>)}</select></label>
      <label><span className="label">Disciplína</span><select className="field" name="tennisDiscipline" defaultValue={initial?.discipline ?? "singles"}><option value="singles">Dvojhra</option><option value="doubles">Štvorhra (jedna položka = dvojica)</option></select></label>
      <NumberInput label="Počet hráčov / dvojíc" name="teams" value={count} set={setCount} max={64} min={2} /><NumberInput label="Počet kurtov" name="fields" value={courts} set={setCourts} max={32} />
      <NumberInput label="Odhad trvania zápasu (min)" name="duration" value={duration} set={setDuration} min={5} max={240} /><label><span className="label">Začiatok</span><input className="field" name="startTime" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
      <label><span className="label">Želaný koniec</span><input className="field" name="preferredEnd" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label><Input label="Štartovné (€)" name="fee" type="number" value={source?.fee ?? 0} />
      <label className="flex gap-3 text-sm font-bold sm:col-span-2"><input type="checkbox" name="lunchBreak" checked={lunch} onChange={(e) => setLunch(e.target.checked)} />Obedná prestávka</label>
      {lunch && <><label><span className="label">Začiatok prestávky</span><input className="field" name="lunchStart" type="time" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} required /></label><NumberInput label="Dĺžka prestávky (min)" name="lunchDuration" value={lunchMinutes} set={setLunchMinutes} min={15} max={180} /></>}
    </div>
    <fieldset className="mt-8 border-t pt-6"><legend className="text-xl font-extrabold">Tenisový systém hry</legend><div className="mt-4 grid gap-3">{[["recommended", `Odporúčanie Tournio: ${TENNIS_SYSTEMS[recommended]}`], ...Object.entries(TENNIS_SYSTEMS)].map(([value, title]) => <label key={value} className="flex gap-3 rounded-xl border p-4 has-[:checked]:border-arena-500 has-[:checked]:bg-arena-50"><input type="radio" checked={system === value} onChange={() => setSystem(value)} /><span className="font-bold">{title}</span></label>)}</div>
      <p className="mt-3 text-sm text-slate-600">Útecha v tejto verzii podporuje plný pavúk 4, 8, 16, 32 alebo 64 hráčov. Ostatné počty podporujú skupiny alebo bežný pavúk s voľným žrebom.</p>
      {effective === "groups_playoff" && <label className="mt-4 block"><span className="label">Postupujúci zo skupiny</span><select className="field" name="qualifiersPerGroup" value={qualifiers} onChange={(e) => setQualifiers(Number(e.target.value))}><option value={1}>1 hráč / dvojica</option><option value={2}>2 hráči / dvojice</option></select></label>}
    </fieldset>
    <div className="mt-6 grid gap-5 sm:grid-cols-2"><label><span className="label">Bodovanie zápasu</span><select className="field" name="tennisScoring" defaultValue={initial?.scoring ?? "set6"}>{Object.entries(TENNIS_SCORING).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name="tennisNoAd" defaultChecked={initial?.noAd ?? false} />No-Ad (rozhodujúca loptička pri zhode)</label></div>
    <div className="mt-6 rounded-2xl bg-arena-50 p-5"><p className="font-bold">{summary ? `${summary.matches.length} zápasov · orientačný koniec ${summary.finishTime}` : problem}</p><p className="mt-2 text-sm">Časy sú odhady, nie garantované začiatky. Počítame s prestávkou medzi kolami; organizátor riadi skutočný nástup na kurt.</p>{summary && summary.finishTime > end && <p className="mt-2 font-bold text-amber-900">Odhad presahuje želaný koniec. Pridajte kurty, zvoľte kratšie bodovanie alebo iný systém.</p>}</div>
    <div className="mt-8 grid gap-5 sm:grid-cols-2"><label><span className="label">Typ turnaja</span><select className="field" name="type" defaultValue={source?.tournamentType ?? "Verejný"}>{["Verejný", "Pozvánkový", "Kombinovaný"].map((t) => <option key={t}>{t}</option>)}</select></label><label><span className="label">Viditeľnosť účastníkov</span><select className="field" name="visibility" defaultValue={source?.teamVisibility ?? "Zobrazovať všetkým"}>{["Zobrazovať všetkým", "Iba prijatým tímom", "Nezobrazovať"].map((t) => <option key={t}>{t}</option>)}</select></label></div>
    <label className="mt-8 block"><span className="label">Hráči alebo dvojice — jeden účastník na riadok</span><textarea className="field min-h-40" value={players} onChange={(e) => setPlayers(e.target.value)} placeholder={"Ján Novák\nPeter Kováč\nPri štvorhre: Ján Novák / Peter Kováč"} /><span className="mt-2 block text-sm text-slate-500">{names.length} z {count} miest. Nevyplnené miesta budú označené číslom hráča. Ide o mená v rozpise, nie automatické e-mailové pozvánky.</span></label>
    <button className="btn-primary mt-8" type="submit" disabled={!summary}>{editSource ? "Uložiť zmeny" : "Vytvoriť tenisový turnaj"}</button>
  </form>;
}
function Input({ label, name, type = "text", value }: { label: string; name: string; type?: string; value?: string | number }) { return <label><span className="label">{label}</span><input className="field" name={name} type={type} defaultValue={value} min={type === "number" ? 0 : undefined} required /></label>; }
function NumberInput({ label, name, value, set, min = 1, max }: { label: string; name: string; value: number; set: (n: number) => void; min?: number; max: number }) { return <label><span className="label">{label}</span><input className="field" name={name} type="number" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} required /></label>; }
