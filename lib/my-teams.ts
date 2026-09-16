import "server-only";
import { createClient } from "@/lib/supabase/server";

type StaffRole = "coach" | "manager" | "club_admin";

export type MyTeam = {
  id: string;
  name: string;
  category: string;
  season: string;
  staffRole: StaffRole | null;
  ownPlayerNames: string[];
  activePlayerCount: number;
};

type Membership = { team_id: string; role: StaffRole };
type GuardianLink = { player_id: string };
type TeamPlayer = { team_id: string; player_id: string };
type TeamRecord = { id: string; name: string; category: string; season: string };
type RosterPlayer = { status: "active" | "inactive" };

export async function getMyTeams() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (authError || !userId) return { userId: null, teams: [] as MyTeam[] };

  const [{ data: membershipData, error: membershipError }, { data: guardianData, error: guardianError }] = await Promise.all([
    supabase.from("team_memberships").select("team_id, role").eq("user_id", userId),
    supabase.from("player_guardians").select("player_id").eq("guardian_user_id", userId),
  ]);
  if (membershipError || guardianError) throw new Error("Tímy sa nepodarilo načítať.");

  const memberships = (membershipData as Membership[] | null) ?? [];
  const guardianLinks = (guardianData as GuardianLink[] | null) ?? [];
  const playerIds = guardianLinks.map((link) => link.player_id);
  let teamPlayers: TeamPlayer[] = [];
  let playerNames = new Map<string, string>();

  if (playerIds.length > 0) {
    const [{ data: teamPlayerData, error: teamPlayerError }, { data: playerData, error: playerError }] = await Promise.all([
      supabase.from("team_players").select("team_id, player_id").in("player_id", playerIds).eq("status", "active"),
      supabase.from("player_profiles").select("id, full_name").in("id", playerIds).eq("status", "active"),
    ]);
    if (teamPlayerError || playerError) throw new Error("Tímy sa nepodarilo načítať.");
    teamPlayers = (teamPlayerData as TeamPlayer[] | null) ?? [];
    playerNames = new Map((playerData ?? []).map((player) => [player.id, player.full_name]));
  }

  const teamIds = [...new Set([...memberships.map((membership) => membership.team_id), ...teamPlayers.map((player) => player.team_id)])];
  if (teamIds.length === 0) return { userId, teams: [] as MyTeam[] };

  const { data: teamData, error: teamError } = await supabase
    .from("club_teams")
    .select("id, name, category, season")
    .in("id", teamIds)
    .eq("status", "active")
    .order("name");
  if (teamError) throw new Error("Tímy sa nepodarilo načítať.");

  const teams = await Promise.all(((teamData as TeamRecord[] | null) ?? []).map(async (team) => {
    const membership = memberships.find((item) => item.team_id === team.id);
    const ownPlayerNames = teamPlayers
      .filter((player) => player.team_id === team.id)
      .map((player) => playerNames.get(player.player_id))
      .filter((name): name is string => Boolean(name));
    const { data: roster, error: rosterError } = await supabase.rpc("get_visible_team_roster", { p_team_id: team.id });
    if (rosterError) throw new Error("Tím sa nepodarilo načítať.");
    return {
      ...team,
      staffRole: membership?.role ?? null,
      ownPlayerNames,
      activePlayerCount: ((roster as RosterPlayer[] | null) ?? []).filter((player) => player.status === "active").length,
    };
  }));

  return { userId, teams };
}
