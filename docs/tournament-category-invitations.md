# Turnajové pozvánky na družstvá

Vyhľadávanie v tvorbe aj úprave turnaja ponúka konkrétne aktívne družstvá z `club_teams`: názov, kategóriu, sezónu a označenie A/B. Vyhľadáva bez diakritiky aj podľa kategórie; filtruje podľa športu. Z jedného klubu možno pridať viac družstiev. Klub bez kategórií má neaktívnu voľbu s vysvetlením. Vlastný tím ostáva samostatná možnosť.

`getTournamentClubs` načítava všetky kategórie po stabilných 500-riadkových stranách. Pri zlyhaní kategórií nesmie potichu ponúknuť len celý klub.

Pre zachovanie kompatibility existujúcich RPC sa konkrétne družstvo prenáša v `p_club_ids` ako `team:<uuid>`. Server overuje jeho aktívny stav aj klub a zostavuje rozpis z databázového názvu. SQL resolver uloží `club_id`, nový `club_team_id` a pôvodný názov družstva do `tournament_invited_teams`. Rovnaký názov z dvoch sezón sa odmietne, aby názvový rozpis nezlúčil odlišné družstvá. Editácia a opakovanie preferujú uložené UUID družstva; neprevedú ho späť na celý klub.

Migrácia `20261115084624_tournament_category_invitations.sql` musí byť aplikovaná pred nasadením formulára. Je spätne kompatibilná: nemení existujúce záznamy ani identifikátory a ponecháva pôvodné RPC podpisy. Starší výber celého klubu je vo formulári označený a možno ho nahradiť konkrétnym družstvom. Kategória sa starým záznamom neodhaduje. Obmedzenia vlastníctva, uzamknutia výsledkov a potvrdenia resetu zostávajú zachované.

Testy: `test-tournament-category-sql.cjs`, `test-tournament-clubs.cjs`, `test-tournament-club-picker.cjs`, `test-club-directory.cjs`; runner SQL a React používa doplnkové testovacie závislosti PGlite a react-test-renderer. V produkcii sa pri overovaní neposielajú pozvánky ani nevytvárajú skúšobné turnaje.
