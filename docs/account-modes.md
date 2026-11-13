# Typ účtu a oprávnenia

Registrácia vyžaduje voľbu `parent` (rodič/hráč) alebo `coach` (tréner/organizátor).
`account_mode` v Auth user metadata je výlučne preferencia rozhrania. Používateľ si ju môže zmeniť v nastaveniach účtu. Nikdy nenahrádza databázové oprávnenia, členstvo v tíme alebo kontrolu opatrovníka hráča.

Oba typy majú rovnaké rodičovské funkcie: profil dieťaťa, pozvania ďalšieho opatrovníka, tímy detí, potvrdenia a komunikáciu. Tréner/organizátor navyše vidí nástroje na turnaje a žiadosti o správu tímu; schválenie existujúceho tímu zostáva samostatné.

Existujúce účty bez preferencie sa zobrazia ako tréner/organizátor, ak majú tímové členstvo, vlastný turnaj, históriu žiadostí alebo platformovú administrátorskú rolu. Ostatné sú rodičovské. Výslovná voľba má prednosť a neodoberá existujúce oprávnenia.

Budúce vedenie klubu bude samostatný klubový rozsah oprávnení naprieč kategóriami. Typ účtu zostane tréner/organizátor; žiadny údaj v používateľských metadata nesmie prideliť tento rozsah. Dnešné `club_admin` členstvo je viazané na konkrétny tím, v žiadosti je označené Správca tímu. Táto zmena nezavádza správu ani prehľad celého klubu.
