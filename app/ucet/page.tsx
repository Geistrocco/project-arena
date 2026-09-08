import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPlayerProfile, inviteGuardian, inviteParentToTeam, requestNewTeam, requestTeamAccess, respondToGuardianInvitation, respondToTeamPlayerInvitation, setMarketingConsent } from "@/app/ucet/actions";

type TeamRosterPlayer = { team_id: string; player_id: string; full_name: string; joined_at: string; status: "active" | "inactive" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ stav?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/prihlasenie");
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  const metadata = data.claims.user_metadata as { full_name?: string } | undefined;
  const userId = typeof data.claims.sub === "string" ? data.claims.sub : "";
  const [{ data: role }, { data: consentEvents }, { data: teams }, { data: claims }, { data: memberships }, { data: teamRequests }, { data: players }, { data: guardianLinks }, { data: guardianInvitations }, { data: teamPlayerInvitations }, { data: managedRoster }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("marketing_consent_events").select("granted").eq("user_id", userId).order("recorded_at", { ascending: false }).limit(1),
    supabase.from("club_teams").select("id, name, category, season").eq("status", "active").order("name"),
    supabase.from("team_claim_requests").select("id, team_id, requested_role, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("team_memberships").select("team_id, role").eq("user_id", userId),
    supabase.from("team_creation_requests").select("id, club_name, category, status").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("player_profiles").select("id, full_name, birth_date, created_at").eq("status", "active").order("created_at"),
    supabase.from("player_guardians").select("player_id, guardian_user_id, relationship, is_primary"),
    supabase.from("guardian_invitations").select("id, player_id, player_name, invited_email, relationship, invited_by, status, expires_at").order("created_at", { ascending: false }),
    supabase.from("team_player_invitations").select("id, team_id, invited_email, invited_by, status, expires_at").order("created_at", { ascending: false }),
    supabase.rpc("get_managed_team_roster"),
  ]);
  const marketingConsent = consentEvents?.[0]?.granted === true;
  const playerById = new Map(players?.map((player) => [player.id, player]));
  const guardianCount = new Map<string, number>();
  guardianLinks?.forEach((link) => guardianCount.set(link.player_id, (guardianCount.get(link.player_id) ?? 0) + 1));
  const incomingInvitations = guardianInvitations?.filter((invitation) => invitation.status === "pending" && new Date(invitation.expires_at) > new Date() && invitation.invited_email.toLowerCase() === email.toLowerCase()) ?? [];
  const sentInvitations = guardianInvitations?.filter((invitation) => invitation.invited_by === userId) ?? [];
  const teamById = new Map(teams?.map((team) => [team.id, team]));
  const incomingTeamInvitations = teamPlayerInvitations?.filter((invitation) => invitation.status === "pending" && invitation.invited_email === email.toLowerCase() && new Date(invitation.expires_at) > new Date()) ?? [];
  const rosterByTeam = new Map<string, TeamRosterPlayer[]>();
  (managedRoster as TeamRosterPlayer[] | null)?.forEach((player) => rosterByTeam.set(player.team_id, [...(rosterByTeam.get(player.team_id) ?? []), player]));
  const date = new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeZone: "Europe/Bratislava" });

  return (
    <section className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="eyebrow">Môj účet</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink">Vitajte{metadata?.full_name ? `, ${metadata.full_name}` : ""}</h1>
        <p className="mt-3 text-slate-600">Prihlásený účet: {email}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn-primary" href="/vytvorit-turnaj">Vytvoriť turnaj</Link>
          {role && ["owner", "admin"].includes(role.role) && <Link className="btn-secondary" href="/admin/pouzivatelia">Administrácia</Link>}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6" id="rodina">
          <h2 className="text-lg font-extrabold text-ink">Rodina a hráči</h2>
          <p className="mt-2 text-sm text-slate-600">Hráč nemá automaticky vlastný prihlasovací účet. Jeho profil môže bezpečne spravovať viac rodičov alebo opatrovníkov.</p>

          {params.stav === "pozvanie-odoslane" && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800" role="status">
            Pozvanie bolo úspešne odoslané e-mailom.
          </div>}

          {incomingTeamInvitations.length > 0 && <div className="mt-5 space-y-3" id="timove-pozvania">
            <h3 className="font-bold text-ink">Pozvania hráča do tímu</h3>
            {incomingTeamInvitations.map((invitation) => <article className="rounded-2xl border border-arena-100 bg-arena-50 p-4" key={invitation.id}>
              <p className="font-bold text-ink">{teamById.get(invitation.team_id)?.name ?? "Klubový tím"}</p>
              {players?.length ? <form action={respondToTeamPlayerInvitation} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input name="invitationId" type="hidden" value={invitation.id} />
                <select className="field" name="playerId" required defaultValue=""><option value="" disabled>Vyberte hráča</option>{players.map((player) => <option key={player.id} value={player.id}>{player.full_name}</option>)}</select>
                <button className="btn-primary justify-center" name="decision" value="accept">Prijať</button>
                <button className="btn-secondary justify-center" name="decision" value="decline">Odmietnuť</button>
              </form> : <p className="mt-2 text-sm text-slate-600">Najskôr si vytvorte profil hráča nižšie. Pozvanie potom môžete prijať.</p>}
            </article>)}
          </div>}

          {params.stav === "hrac-pridany-do-timu" && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800" role="status">Hráč bol úspešne pridaný do tímu.</div>}

          {incomingInvitations.length > 0 && <div className="mt-5 space-y-3">
            <h3 className="font-bold text-ink">Pozvania pre vás</h3>
            {incomingInvitations.map((invitation) => <article className="rounded-2xl border border-arena-100 bg-arena-50 p-4" key={invitation.id}>
              <p className="font-bold text-ink">{invitation.player_name}</p>
              <p className="mt-1 text-sm text-slate-600">Pozvanie platí do {date.format(new Date(invitation.expires_at))}.</p>
              <form action={respondToGuardianInvitation} className="mt-3 flex flex-wrap gap-2">
                <input name="invitationId" type="hidden" value={invitation.id} />
                <button className="btn-primary" name="decision" value="accept" type="submit">Prijať</button>
                <button className="btn-secondary" name="decision" value="decline" type="submit">Odmietnuť</button>
              </form>
            </article>)}
          </div>}

          <div className="mt-5 space-y-4">
            {players?.map((player) => <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5" key={player.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-extrabold text-ink">{player.full_name}</h3><p className="mt-1 text-sm text-slate-600">{player.birth_date ? `Narodenie: ${date.format(new Date(`${player.birth_date}T12:00:00Z`))} · ` : ""}{guardianCount.get(player.id) ?? 1} {(guardianCount.get(player.id) ?? 1) === 1 ? "správca" : "správcovia"}</p></div>
                {guardianLinks?.some((link) => link.player_id === player.id && link.guardian_user_id === userId && link.is_primary) && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-arena-700">Hlavný rodič</span>}
              </div>
              <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer text-sm font-bold text-arena-700">Pozvať ďalšieho rodiča alebo opatrovníka</summary>
                <form action={inviteGuardian} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
                  <input name="playerId" type="hidden" value={player.id} />
                  <label><span className="label">E-mail</span><input className="field" name="email" type="email" required placeholder="rodic@email.sk" /></label>
                  <label><span className="label">Vzťah</span><select className="field" name="relationship" defaultValue="parent"><option value="parent">Rodič</option><option value="guardian">Opatrovník</option></select></label>
                  <button className="btn-secondary self-end justify-center" type="submit">Odoslať pozvanie</button>
                </form>
                <p className="mt-2 text-xs text-slate-500">Pozvanie bude fungovať iba po prihlásení rovnakou e-mailovou adresou a vyprší po 14 dňoch.</p>
              </details>
            </article>)}
            {!players?.length && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">Zatiaľ nemáte pridaného hráča.</p>}
          </div>

          <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer font-bold text-arena-700">Pridať hráča</summary>
            <p className="mt-2 text-sm text-slate-600">Vytvorte profil svojho dieťaťa. Ďalšieho rodiča môžete pozvať následne.</p>
            <form action={createPlayerProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
              <label><span className="label">Meno a priezvisko hráča</span><input className="field" name="fullName" maxLength={120} required /></label>
              <label><span className="label">Dátum narodenia <span className="font-normal text-slate-500">(voliteľné)</span></span><input className="field" name="birthDate" type="date" /></label>
              <button className="btn-primary justify-center sm:col-span-2" type="submit">Vytvoriť profil hráča</button>
            </form>
          </details>

          {sentInvitations.length > 0 && <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-bold text-slate-700">Odoslané pozvania ({sentInvitations.length})</summary><div className="mt-3 space-y-2">{sentInvitations.map((invitation) => <p className="text-sm text-slate-600" key={invitation.id}>{playerById.get(invitation.player_id)?.full_name ?? "Hráč"} · {invitation.invited_email} · <strong>{invitation.status === "pending" && new Date(invitation.expires_at) <= new Date() ? "vypršalo" : invitation.status === "pending" ? "čaká" : invitation.status === "accepted" ? "prijaté" : invitation.status === "declined" ? "odmietnuté" : invitation.status === "expired" ? "vypršalo" : "zrušené"}</strong></p>)}</div></details>}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-extrabold text-ink">Môj klubový tím</h2>
          <p className="mt-2 text-sm text-slate-600">Vyberte konkrétny tím a požiadajte o overenie. Prístup nevznikne automaticky.</p>
          <form action={requestTeamAccess} className="mt-4 grid gap-4 sm:grid-cols-2">
            <select className="field sm:col-span-2" name="teamId" required defaultValue=""><option value="" disabled>Vyberte klub a kategóriu</option>{teams?.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.season}</option>)}</select>
            <label><span className="label">Funkcia v tíme</span><select className="field" name="requestedRole" required defaultValue="coach"><option value="coach">Tréner</option><option value="manager">Vedúci tímu</option><option value="club_admin">Administrátor klubu</option></select></label>
            <label><span className="label">Telefónne číslo <span className="font-normal text-slate-500">(voliteľné)</span></span><input className="field" name="phone" maxLength={30} placeholder="+421 900 000 000" type="tel" /></label>
            <label className="sm:col-span-2"><span className="label">Ako môžeme overiť váš vzťah k tímu? <span className="font-normal text-slate-500">(voliteľné)</span></span><textarea className="field min-h-28 resize-y" name="message" maxLength={1000} placeholder="Môžete uviesť napríklad svoju funkciu, klubový kontakt alebo odkaz na verejný profil." /></label>
            <p className="text-xs text-slate-500 sm:col-span-2">Žiadosť posúdime podľa e-mailu vášho účtu. Ak budeme potrebovať ďalšie potvrdenie, ozveme sa vám.</p>
            <button className="btn-primary justify-center sm:col-span-2" type="submit">Požiadať o správu tímu</button>
          </form>
          <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer font-bold text-arena-700">Nenašli ste svoj tím?</summary>
            <p className="mt-2 text-sm text-slate-600">Navrhnite ho na pridanie. Zverejní sa až po kontrole administrátorom.</p>
            <form action={requestNewTeam} className="mt-4 grid gap-4 sm:grid-cols-2">
              <label><span className="label">Názov klubu</span><input className="field" name="clubName" maxLength={160} required /></label>
              <label><span className="label">Mesto</span><input className="field" name="city" maxLength={100} required /></label>
              <label><span className="label">Kategória</span><input className="field" name="category" maxLength={30} placeholder="U12" required /></label>
              <label><span className="label">Sezóna</span><input className="field" name="season" pattern="[0-9]{4}/[0-9]{2}" defaultValue="2026/27" required /></label>
              <label><span className="label">Vaša funkcia</span><select className="field" name="requestedRole" defaultValue="coach" required><option value="coach">Tréner</option><option value="manager">Vedúci tímu</option><option value="club_admin">Administrátor klubu</option></select></label>
              <label><span className="label">Odkaz <span className="font-normal text-slate-500">(voliteľné)</span></span><input className="field" name="sourceUrl" maxLength={500} placeholder="Sportnet alebo web klubu" type="url" /></label>
              <label className="sm:col-span-2"><span className="label">Poznámka <span className="font-normal text-slate-500">(voliteľné)</span></span><textarea className="field min-h-24" name="message" maxLength={1000} /></label>
              <button className="btn-secondary justify-center sm:col-span-2" type="submit">Odoslať tím na schválenie</button>
            </form>
          </details>
          {(memberships?.length ?? 0) > 0 && <div className="mt-6 space-y-4" id="moje-timy">
            <h3 className="font-bold text-ink">Moje overené tímy ({memberships?.length})</h3>
            {params.stav === "timove-pozvanie-odoslane" && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800" role="status">Pozvanie rodičovi bolo úspešne odoslané e-mailom.</div>}
            {memberships?.map((membership) => <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={membership.team_id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-ink">{teamById.get(membership.team_id)?.name ?? "Tím"}</p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">{rosterByTeam.get(membership.team_id)?.filter((player) => player.status === "active").length ?? 0} hráčov</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {(rosterByTeam.get(membership.team_id)?.length ?? 0) > 0 ? <ul className="divide-y divide-slate-100">
                  {rosterByTeam.get(membership.team_id)?.map((player) => <li className="flex items-center justify-between gap-4 px-4 py-3" key={player.player_id}>
                    <div><p className="font-semibold text-ink">{player.full_name}</p><p className="text-xs text-slate-500">V tíme od {date.format(new Date(player.joined_at))}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${player.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{player.status === "active" ? "Aktívny" : "Neaktívny"}</span>
                  </li>)}
                </ul> : <p className="px-4 py-5 text-sm text-slate-500">V tomto tíme zatiaľ nie je žiadny hráč.</p>}
              </div>
              <form action={inviteParentToTeam} className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input name="teamId" type="hidden" value={membership.team_id} />
                <input className="field flex-1" name="email" type="email" required placeholder="E-mail rodiča hráča" />
                <button className="btn-secondary justify-center" type="submit">Pozvať hráča</button>
              </form>
            </article>)}
          </div>}
          {(claims?.length ?? 0) > 0 && <div className="mt-4 space-y-2">{claims?.map((claim) => <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm" key={claim.id}>Žiadosť: <strong>{claim.status === "pending" ? "čaká na schválenie" : claim.status === "approved" ? "schválená" : "zamietnutá"}</strong></p>)}</div>}
          {(teamRequests?.length ?? 0) > 0 && <div className="mt-4 space-y-2">{teamRequests?.map((request) => <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm" key={request.id}>{request.club_name} {request.category}: <strong>{request.status === "pending" ? "čaká na schválenie" : request.status === "approved" ? "schválený" : "zamietnutý"}</strong></p>)}</div>}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-extrabold text-ink">E-mailové novinky a ponuky</h2>
          <p className="mt-2 text-sm text-slate-600">
            Aktuálne nastavenie: <strong>{marketingConsent ? "súhlas udelený" : "bez súhlasu"}</strong>. Nastavenie môžete kedykoľvek zmeniť.
          </p>
          <form action={setMarketingConsent} className="mt-4">
            <input name="granted" type="hidden" value={marketingConsent ? "false" : "true"} />
            <button className="btn-secondary" type="submit">
              {marketingConsent ? "Odvolať súhlas" : "Povoliť novinky a ponuky"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
