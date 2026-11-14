// The manager tutorials: the 4 main pages, then their most-used inner pages.
// Add a storyboard here and run `npm run capture -- <id>` then `npm run render -- <id>` (see tutorials/README.md).
import type { Storyboard } from "../storyboard";
import { accueil } from "./accueil";
import { appels } from "./appels";
import { clients } from "./clients";
import { espaceMission } from "./espace-mission";
import { ficheListe } from "./fiche-liste";
import { listes } from "./listes";
import { rdv } from "./rdv";
import { taches } from "./taches";

export const STORYBOARDS: Storyboard[] = [accueil, listes, rdv, clients, ficheListe, espaceMission, appels, taches];
