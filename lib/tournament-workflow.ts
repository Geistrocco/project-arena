export type TournamentDrawContext={capacity:number;participants:Array<{name:string;source:string}>;slots:Array<{name:string}>;closed:boolean;locked:boolean;has_results:boolean;pending:number};
type Input={slug:string;context:TournamentDrawContext;finished:number;matchCount:number;locked:boolean;publicationStatus:string;date:string;today:string};
export function tournamentWorkflow({slug,context:c,finished,matchCount,locked,publicationStatus,date,today}:Input) {
  const base=`/turnaje/${slug}`;
  const state=(kind:string,title:string,description:string,href:string,label:string,tone:"green"|"amber"|"neutral"="neutral")=>({kind,title,description,href,label,tone});
  if(publicationStatus==="cancelled")return state("cancelled","Turnaj je zrušený","Skontroluj informácie zobrazené účastníkom.",base,"Verejná stránka");
  if(locked||c.locked)return state("locked","Výsledky sú potvrdené","Turnaj má uzamknuté výsledky a konečné poradie.",base,"Zobraziť výsledky","green");
  if(matchCount>0&&finished===matchCount)return state("finished","Všetky zápasy sú dokončené","Skontroluj výsledky a potvrď konečné poradie turnaja.","#potvrdenie-vysledkov","Skontrolovať a uzamknúť výsledky","green");
  if(c.has_results)return state("playing","Zadávanie výsledkov",`Dokončené zápasy: ${finished} z ${matchCount}. Pokračuj v zapisovaní výsledkov.`,"#zapasy","Otvoriť zápasy");
  if(c.closed)return state("scheduled","Účastníci a rozpis sú potvrdení","Prihlášky sú uzavreté. Rozpis je pripravený na zapisovanie výsledkov.","#zapasy","Otvoriť rozpis","green");
  if(date<today)return state("past","Termín turnaja už uplynul","Pred prípravou nového rozlosovania skontroluj termín a nastavenia turnaja.",`${base}/upravit`,"Skontrolovať nastavenia","amber");
  if(c.pending>0)return state("pending",`${c.pending} ${c.pending===1?"prihláška čaká":c.pending<5?"prihlášky čakajú":"prihlášok čaká"} na rozhodnutie`,"Otvor čakajúce prihlášky a rozhodni o prijatí tímov.","#prihlaska","Vybaviť prihlášky","amber");
  if(c.participants.length<c.capacity)return state("collecting","Doplň účastníkov turnaja",`Prijaté a ručne zadané tímy: ${c.participants.length} z ${c.capacity}. Voľné miesta: ${c.capacity-c.participants.length}.`,`${base}/upravit#pozvane-timy`,"Doplniť pozvané tímy");
  if(c.participants.length!==c.capacity||c.slots.length!==c.capacity||new Set(c.slots.map(s=>s.name)).size!==c.slots.length||c.participants.length<2)return state("mismatch","Skontroluj kapacitu a miesta v rozpise","Počet účastníkov a základných miest v rozpise sa musí zhodovať.",`${base}/upravit`,"Upraviť nastavenia","amber");
  return state("ready","Účastníci sú pripravení na rozlosovanie","Otvor náhľad skupín, skontroluj účastníkov a potvrď rozpis. Uloženie vyžaduje tvoje potvrdenie.",`${base}/rozlosovanie`,"Otvoriť náhľad rozlosovania","green");
}
