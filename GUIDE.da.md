# Glow Floorplan Card – installation, opsætning og dashboard

**Miljø:** Home Assistant OS (192.168.0.206) · Ekstern adgang: `https://ha.dmweb.dk`
**Kort:** Glow Floorplan Card (`DanielMikkelsen99/glow-floorplan-card`), installeret via Marketplace
**Formål:** En plantegning, hvor hvert rum lyser i lampernes rigtige farve og lysstyrke. Rum pulserer ved bevægelse, robotter og vaskemaskine får en statusring, og tegningen kan vises i 2D og 3D med flere etager. Alt redigeres med træk-og-slip direkte i dashboard-editoren.

---

## 1. Overblik

| Hvad | Hvor |
|---|---|
| Kildekode og releases | `https://github.com/DanielMikkelsen99/glow-floorplan-card` |
| Installeret fil | `/config/www/community/glow-floorplan-card/glow-floorplan-card.js` |
| Dashboard-ressource | Oprettes automatisk af Marketplace |
| Selve plantegningen | Dashboard *Forside* → visningen *Plantegning* (`/dashboard-forside/plantegning`) |
| Kopi, der læser fra Forside | Dashboard *Tablet* → *Plantegning* (`/dashboard-tablet/plantegning`) |

> Plantegningen vedligeholdes **kun ét sted**: på Forside. Tablet-kortet henter den derfra med `layout_from`, så ændringer vises begge steder.

---

## 2. Forudsætninger

- [ ] Home Assistant 2024.1 eller nyere (Marketplace kræver 2026.11; på ældre versioner bruges HACS)
- [ ] Marketplace er åbnet én gang, og advarslen om community-projekter er accepteret
- [ ] En GitHub-konto er forbundet i Marketplace (kræves for at tilføje et eget repository)

---

## 3. Installation

1. Gå til **Indstillinger → Marketplace**.
2. Tryk **⋮** øverst til højre → **Add from link** (i HACS: **Custom repositories**).
3. Indsæt `https://github.com/DanielMikkelsen99/glow-floorplan-card` og vælg typen **Dashboard** (i HACS: *Dashboard* / *Plugin*).
4. Find **Glow Floorplan Card** på listen og tryk **Download / Installér**.
5. Genindlæs browseren eller appen. På telefonen: **Indstillinger → Companion app → Fejlfinding → Nulstil frontend-cache**.

Marketplace registrerer selv kortet som dashboard-ressource. Der skal **ikke** tilføjes noget manuelt under *Ressourcer*.

### Manuel installation (kun hvis Marketplace ikke kan bruges)

1. Hent `glow-floorplan-card.js` fra seneste release på GitHub.
2. Læg filen i `/config/www/`.
3. Gå til **Indstillinger → Dashboards → ⋮ → Ressourcer → Tilføj ressource**, URL `/local/glow-floorplan-card.js?v=1.4.3`, type **JavaScript-modul**.
4. Hæv `?v=` ved hver opdatering, ellers bruger browseren den gamle fil fra sin cache.

---

## 4. Tilføj kortet til et dashboard

### Ny plantegning

1. Åbn dashboardet → **⋮ → Rediger dashboard**.
2. Tilføj en ny visning med typen **Panel (1 kort)**, så plantegningen fylder hele skærmen. Slå eventuelt **Subview** til og angiv en tilbage-sti, hvis siden åbnes fra en knap.
3. Tryk **+ Tilføj kort**, søg efter **Glow Floorplan Card** og vælg det.
4. Byg tegningen i den visuelle editor (se afsnit 5), og tryk **Gem**.

### Samme plantegning på et andet dashboard

Brug kodeeditoren på kortet og indsæt:

```yaml
type: custom:glow-floorplan-card
layout_from: dashboard-forside
```

Kortet læser det første Glow Floorplan Card på det angivne dashboard. Sådan er Tablet sat op.

### Knap, der åbner plantegningen

En knap eller et heading-badge med:

```yaml
tap_action:
  action: navigate
  navigation_path: /dashboard-tablet/plantegning
```

---

## 5. Opsætning i editoren

Editoren har faner øverst:

| Fane | Bruges til |
|---|---|
| **Enheder** | Træk ikoner på plads. Klik på et ikon for at vælge entitet, ikon og hvad der sker ved tryk. **+ Måling** tilføjer en værdi-chip, fx temperatur. |
| **Rum** | Klik på et rum og træk i hjørnerne. Den blå prik flytter navnet. Tilføj eller fjern hjørner for L-formede rum. Hjørner snapper til naborum; hold **Alt** for at flytte frit. |
| **Åbninger** | Fjern væggen mellem to rum (fx stue og spisestue). |
| **Møbler** | Vælg et møbel, træk det på plads, ændr størrelse med den blå prik og drej i trin på 90°. Blandt møblerne er *Trappe op*, *Trappe ned* og *Fjernsyn*. |
| **Døre & vinduer** | Tegn døre og vinduer i væggene. Den orange ende er hængslet. Kobl en sensor på, så døren tegnes åben, når den er åben. **↻ Drej 90°** drejer døren, vinduet eller åbningen. Typen *Åbning (uden dør)* gør en dør til et hul i væggen, og **Gør til dør** gør det modsatte. |
| **Kortindstillinger** | Størrelse på tegnefladen, tema (auto/dag/nat), glødstyrke og 3D-indstillinger. |

### Etager

- Vælg, tilføj, omdøb, flyt og slet etager øverst i editoren.
- Tryk **★ Standard** på den etage, kortet skal åbne på (hos os: *Stueetage*).
- På kortet viser en gul prik ved en anden etage, at der er tændt lys dér; en blå prik, at der er bevægelse.

### 2D og 3D

Knappen **2D / 3D** står over tegningen. Valget huskes pr. browser. Startvisning og knappen kan styres i koden:

```yaml
view: 2d            # eller 3d
view_toggle: true   # false skjuler knappen
```

### Kopiér og indsæt

På en computer: vælg noget på tegningen (enhed, rum, åbning, dør, vindue eller møbel) og tryk **Ctrl+C**, derefter **Ctrl+V** (på Mac ⌘C / ⌘V). Kopien lægges lidt forskudt; tryk Ctrl+V igen for flere. Du kan skifte etage, før du indsætter.

### Tryk på et rum

Et tryk på et rum tænder eller slukker alle lamper i rummet samlet: er én tændt, slukker alle, ellers tændes alle. Kortet finder selv lamperne ud fra, hvor ikonerne står, og kontakter med *Gløder* tæller med. Flytter du et ikon til et andet rum, følger det med. Et hold på rummet åbner detaljerne. Vil et rum kun styre sin ene enhed, sæt `tap_devices: false`.

### Gulv i rummene

Under **Gulv** i rum-panelet vælges gulvtæppe, fliser, klinker, træ (plankegulv), sildeben eller laminat. Gulvet vises i 2D og 3D, om dagen og om natten, og lyset fra lamperne ligger stadig hen over.

### Fjernsyn, der lyser

Vælg møblet *Fjernsyn*. Under **Enhed** vælges det, der viser om fjernsynet er i brug, fx en strømsensor (`sensor.fjernsyn_power_2`). Under **Standby under** skrives grænsen i watt (standard 5 W). Over grænsen sender fjernsynet en blød hvid lyskegle ud over gulvet, og i 3D lyser skærmen. En mediaafspiller eller et stik virker også – så lyser det, når det er tændt.

### Møbler i 3D og placering

I 3D er møblerne bygget af rigtige dele: sofaer med ryglæn, armlæn, puder og ben, senge med gavl, madras og puder, borde på ben, spisebord med stole, skrivebord med skærm og kontorstol, kommode og skab med fronter. Stof og træ har en let tekstur.

Står et møbel ind i en væg eller et andet møbel, flyttes det på dashboardet den korteste vej fri (højst 80 enheder). Editoren viser stadig de gemte placeringer. Slås fra med `avoid_overlap: false`.

### Skygger og dybde

Gulvet bliver mørkere ind mod væggene, og vægge og møbler kaster bløde skygger. Slås fra med `shading: false`.

### Statusring (robotter og vaskemaskine)

Støvsugere og plæneklippere får automatisk en grøn, pulserende ring, mens de kører, og en rød ved fejl. Andre enheder kan få ringen med `ring_states`. Eksempel fra kælderen:

```yaml
- entity: input_boolean.vaskemaskine_korer
  icon: mdi:washing-machine
  ring_states: ["on"]
  tap_action:
    action: more-info
    entity: sensor.kaelder_vaske_torre_elektrisk_effekt
  x: 420
  y: 595
```

`input_boolean.vaskemaskine_korer` styres af automationen *Vaske-tørre – færdig og elpris*.

---

## 6. Opdatering

1. Når en ny release er udgivet på GitHub, vises opdateringen under **Indstillinger → Opdateringer** og i Marketplace.
2. Tryk **Opdatér**, og genindlæs bagefter browseren/appen (nulstil frontend-cachen på telefonen).
3. Vil du se den med det samme: Marketplace → **Glow Floorplan Card → ⋮ → Refresh information**.

### Ny release (når kortet er ændret)

1. Hæv `VERSION` øverst i `glow-floorplan-card.js` (fx `1.4.3` → `1.4.4`).
2. På GitHub: **Releases → Draft a new release** (direkte: `github.com/DanielMikkelsen99/glow-floorplan-card/releases/new`).
3. **Choose a tag** → skriv `v1.4.4` → **Create new tag on publish**, target `main`.
4. Titel `v1.4.4`, eventuelt **Generate release notes**, og tryk **Publish release**.
5. Workflowen *Release* lægger kortfilen på releasen. Den fejler, hvis tagget ikke passer til `VERSION` i filen.

---

## 7. Fejlsøgning

| Problem | Løsning |
|---|---|
| "Custom element doesn't exist: glow-floorplan-card" | Ressourcen er ikke indlæst. Genindlæs, nulstil frontend-cachen, og tjek under *Ressourcer*, at `/local/community/glow-floorplan-card/glow-floorplan-card.js` findes. |
| Ændringer i kortet vises ikke efter opdatering | Browseren bruger en gammel fil fra cachen. Hård genindlæsning eller *Nulstil frontend-cache* i appen. |
| Tablet viser en besked om, at plantegningen hentes fra Forside | Det er editoren på Tablet-kortet. Rediger tegningen på Forside i stedet. |
| Kopien med `layout_from` viser en fejl | Tjek, at dashboardets url-sti er rigtig (`dashboard-forside`), og at der ligger et Glow Floorplan Card på det. |
| Et rum lyser ikke | Lampen skal stå **inde i rummet** som enhed. Lamper uden for alle rum får kun en svag glorie. |
| Ingen statusring | Ringen vises kun, når entitetens tilstand står i `ring_states` (eller er `cleaning`/`mowing`/`returning` for robotter). |
| Marketplace kan ikke tilføje repoet | Forbind en GitHub-konto i Marketplace, og acceptér første-gangs-advarslen. |

---

*Oprettet 23.11.2026. Installeret version: v1.4.3.*
