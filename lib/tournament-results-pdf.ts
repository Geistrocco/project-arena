import { jsPDF } from "jspdf";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Tournament } from "@/types/tournament";
import { calculateStandings, calculateTennisStandings, type PlanGroup, type PlanMatch } from "@/lib/tournament-plan-calculations";

import { tennisScoreLabel } from "@/lib/tennis";

export async function createResultsPdf(tournament: Tournament, groups: PlanGroup[], matches: PlanMatch[], siteUrl: string, lockedAt: string | null = null) {
  const font = await readFile(path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf"));
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", font.toString("base64"));
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.setFont("DejaVu");
  const tennis = tournament.sport === "Tenis";
  const consolation = tennis && matches[0]?.tennis_system === "consolation";
  const bracketOnly = tennis && ["knockout", "consolation"].includes(matches[0]?.tennis_system ?? "");
  const standingsFor = (group: PlanGroup) => tennis ? calculateTennisStandings(group, matches) : calculateStandings(group, matches);
  const complete = matches.length > 0 && matches.every((m) => m.status === "finished" && m.home_score !== null && m.away_score !== null);
  const created = new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(new Date());
  let y = 20;
  function space(height: number) { if (y + height > 276) { doc.addPage(); y = 20; } }
  function text(value: string, size = 10) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, 178) as string[];
    const height = Math.max(6, size * 0.43);
    for (const line of lines) { space(height); doc.text(line, 16, y); y += height; }
  }
  function heading(value: string) { space(32); y += 5; doc.setTextColor(20, 115, 65); text(value, 14); doc.setTextColor(25, 35, 30); y += 2; }
  function table(headers: string[], rows: string[][], widths: number[], podium = false) {
    function row(cells: string[], header = false) {
      doc.setFontSize(8);
      const wrapped = cells.map((cell, i) => doc.splitTextToSize(cell, widths[i] - 4) as string[]);
      const height = Math.max(8, ...wrapped.map((lines) => lines.length * 4 + 4));
      if (y + height > 276) { doc.addPage(); y = 20; if (!header) row(headers, true); }
      if (header) { doc.setFillColor(232, 244, 236); doc.rect(16, y, 178, height, "F"); }
      let x = 16;
      wrapped.forEach((lines, i) => {
        const rank = !header && podium && i === 0 ? Number(cells[0].split(".")[0]) : 0;
        if (rank >= 1 && rank <= 3) {
          const colors = [[210, 164, 45], [160, 170, 180], [177, 110, 61]];
          const color = colors[rank - 1]; doc.setFillColor(color[0], color[1], color[2]);
          doc.circle(x + 3, y + 4, 1.7, "F"); doc.text(lines, x + 7, y + 5);
        } else doc.text(lines, x + 2, y + 5);
        x += widths[i];
      });
      doc.setDrawColor(220, 228, 222); doc.line(16, y + height, 194, y + height); y += height;
    }
    row(headers, true); rows.forEach((cells) => row(cells)); y += 5;
  }
  text("TOURNIO / VÝSLEDKY TURNAJA", 10);
  y += 4; text(tournament.name, 22);
  text(`${tournament.displayDate} | ${tournament.city} | ${tournament.sport} | ${tournament.category}`);
  text(lockedAt && complete ? "POTVRDENÉ KONEČNÉ VÝSLEDKY" : "PRIEBEŽNÉ VÝSLEDKY", 12);
  if (complete && !lockedAt) text("Všetky zápasy sú odohrané. Čaká sa na potvrdenie organizátorom.", 9);
  text(`Vytvorené: ${created}`, 8);
  const singleFinal = groups.length === 1 && matches.every((m) => m.phase === "group");
  const placements = new Map<number, string>();
  function placeFromMatch(match: PlanMatch, rank: number) {
    const home = match.resolved_home_name ?? match.home_team_name;
    const away = match.resolved_away_name ?? match.away_team_name;
    if (!home || !away || match.home_score === null || match.away_score === null || match.home_score === match.away_score) return;
    placements.set(rank, match.home_score > match.away_score ? home : away);
    placements.set(rank + 1, match.home_score > match.away_score ? away : home);
  }
  if (complete && lockedAt) {
    const finalGroup = groups.find((g) => g.code === "GOLD") ?? (singleFinal ? groups[0] : undefined);
    if (finalGroup) {
      const rows = standingsFor(finalGroup);
      const tied = !tennis && rows.some((r, i) => i > 0 && r.points === rows[i - 1].points && r.difference === rows[i - 1].difference && r.scored === rows[i - 1].scored);
      if (!tied) rows.forEach((r, i) => placements.set(i + 1, r.name));
      const silver = groups.find((g) => g.code === "SILVER");
      if (silver && !singleFinal) {
        const silverRows = standingsFor(silver);
        const silverTied = silverRows.some((r, i) => i > 0 && r.points === silverRows[i - 1].points && r.difference === silverRows[i - 1].difference && r.scored === silverRows[i - 1].scored);
        if (!silverTied) silverRows.forEach((r, i) => placements.set(rows.length + i + 1, r.name));
      }
    } else {
      const final = matches.filter((m) => m.phase === "playoff").at(-1);
      if (final) placeFromMatch(final, 1);
      for (const match of matches.filter((m) => m.phase === "placement" && !consolation)) {
        const rank = /^(\d+)\. miesto skupiny /.exec(match.home_source ?? "");
        if (rank) placeFromMatch(match, Number(rank[1]) * 2 - 1);
        else if (match.home_source?.startsWith("Porazený zápasu") && match.away_source?.startsWith("Porazený zápasu")) placeFromMatch(match, 3);
      }
    }
  }
  if (placements.size) {
    heading("Konečné poradie - rozhodnuté miesta");
    table(["Miesto", tennis ? "Hráč / dvojica" : "Tím"], [...placements].sort(([a], [b]) => a - b).map(([rank, name]) => [`${rank}.`, name]), [25, 153], true);
  }
  for (const group of bracketOnly ? [] : groups) {
    const groupMatches = matches.filter((m) => m.group_id === group.id);
    const isFinal = group.code === "GOLD" || singleFinal;
    const decided = complete && isFinal && groupMatches.length > 0 && placements.has(1);
    heading(`${group.name}${decided ? " - konečné poradie" : " - tabuľka"}`);
    const standings = standingsFor(group);
    if (tennis) {
      const rows = calculateTennisStandings(group, matches);
      table(["# / Hráč", "Z", "V", "P", "Sety", "Gemy"], rows.map((r, i) => [
        `${i + 1}. ${r.name}`, String(r.played), String(r.wins), String(r.losses), `${r.scored}:${r.conceded}`, `${r.gamesWon}:${r.gamesLost}`,
      ]), [92, 12, 12, 12, 25, 25]);
    } else table(["# / Tím", "Z", "V", "R", "P", "Skóre", "Body"], standings.map((r, i) => [
      `${i + 1}. ${decided && i < 3 ? ["ZLATO", "STRIEBRO", "BRONZ"][i] + " / " : ""}${r.name}`,
      String(r.played), String(r.wins), String(r.draws), String(r.losses), `${r.scored}:${r.conceded}`, String(r.points),
    ]), [91, 12, 12, 12, 12, 23, 16]);
  }
  const phases = [["group", "Základná časť"], ["final_group", "Nadstavbová časť"], ["playoff", "Play-off"], ["placement", "Zápasy o umiestnenie"]] as const;
  for (const [phase, label] of phases) {
    const selected = matches.filter((m) => m.phase === phase);
    if (!selected.length) continue;
    heading(consolation && phase === "placement" ? "Útecha" : label);
    table(["#", tennis ? "Odhad / Kurt" : "Čas / Ihrisko", "Zápas", "Výsledok"], selected.map((m) => [String(m.match_number), `${m.starts_at.slice(0, 5)} / ${m.field_number}`,
      `${m.resolved_home_name ?? m.home_team_name ?? m.home_source ?? "Neurčený tím"} - ${m.resolved_away_name ?? m.away_team_name ?? m.away_source ?? "Neurčený tím"}`,
      m.status === "finished" && m.home_score !== null && m.away_score !== null ? (tennis ? tennisScoreLabel(m.tennis_sets) : `${m.home_score} : ${m.away_score}`) : "- : -",
    ]), [10, 30, 116, 22]);
  }
  const url = `${siteUrl.replace(/\/$/, "")}/turnaje/${encodeURIComponent(tournament.slug)}`;
  heading("Aktuálne výsledky online"); text(url, 8);
  if (!complete || !lockedAt) text("Výsledky nie sú potvrdené organizátorom. Poradie a výsledky sa môžu zmeniť.", 9);
  else text(tennis ? "Poradie: výhry, vzájomný zápas pri zhode dvoch hráčov, podiel setov a gemov; pri úplnej zhode poradie úvodného žrebu." : "Uvádzame iba jednoznačne rozhodnuté miesta. Pri zhode bodov, rozdielu skóre a strelených gólov musí konečné poradie potvrdiť organizátor.", 9);
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(110); doc.text(`Tournio | ${created} | ${page} / ${count}`, 16, 288); }
  return new Uint8Array(doc.output("arraybuffer"));
}
