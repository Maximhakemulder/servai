# SERVAI · standaard kassaformaat

Elke koppeling (Untill, een andere kassa, een CSV-export) vertaalt zijn data naar dit ene formaat.
Het dashboard kent alleen dit formaat. Een nieuwe kassa bouwen betekent dus alleen: de velden van die kassa
koppelen aan de velden hieronder. Het dashboard verandert niet.

Code: `netlify/lib/kassa.mjs` (controleren en wegschrijven) · endpoint voor beheerders: `POST /api/ingest`.

## Pakket

```json
{
  "locatie_id": "uuid van de locatie in SERVAI",
  "bonnen": [ { ...bon } ],
  "uren":   [ { ...uur } ],
  "temperaturen":   [ { ...meting } ],
  "google_profiel": [ { ...dag } ],
  "evenementen":    [ { ...evenement } ]
}
```
Maximaal 5000 bonnen per pakket. Alle lijsten zijn optioneel. Opnieuw sturen van dezelfde bon is veilig:
de bon wordt bijgewerkt, niet verdubbeld.

## Bon (één afgerekende bon)

| Veld | Verplicht | Uitleg |
|---|---|---|
| `ref` | ja | Bonnummer of id uit de kassa. Moet per locatie uniek zijn. |
| `tijd` | ja | Moment van afrekenen, met tijdzone: `2026-11-01T21:14:00+01:00` |
| `regels` | liever wel | Lijst met regels (zie onder). Nodig voor omzet per gerecht, groep en upselling. |
| `totaal` | als er geen regels zijn | Bedrag incl. btw zoals op de bon |
| `netto` of `btw` | als er geen regels zijn | Omzet excl. btw, of het btw-bedrag. Zonder een van beide kunnen we de omzet niet uitrekenen. |
| `couverts` | nee | Aantal gasten. Zonder dit geen omzet per gast. |
| `tafel`, `medewerker`, `betaalwijze` | nee | `betaalwijze` bij voorkeur `pin`, `contant`, `creditcard` of `bon` |
| `fooi`, `korting` | nee | Bedragen |
| `storno` | nee | `true` bij een creditbon of retour. Bedragen worden dan negatief opgeslagen. |
| `bedrijfsdag` | nee | `2026-11-01`. Laat leeg: een bon voor 05:00 telt dan mee bij de dag ervoor. |

## Regel

| Veld | Verplicht | Uitleg |
|---|---|---|
| `artikel` | ja | Naam van het product |
| `groep` | nee | Bijvoorbeeld Bier, Wijn, Keuken |
| `aantal` | nee | Standaard 1 |
| `bedrag` | ja | Totaal van de regel **incl. btw** |
| `btw_pct` | ja, of geef `netto` | Bijvoorbeeld 9 of 21. Zo rekenen we naar omzet excl. btw. |
| `netto` | alternatief | Als de kassa de omzet excl. btw al geeft |
| `korting` | nee | Bedrag |

## Uur (uren uit het rooster)

| Veld | Verplicht | Uitleg |
|---|---|---|
| `datum` | ja | `2026-11-01` (bedrijfsdag) |
| `medewerker` | ja | Naam of code. Per locatie, dag en medewerker één rij. |
| `gepland`, `gewerkt` | nee | Uren |
| `kosten` | nee | Loonkosten incl. werkgeverslasten, in euro. Zonder kosten geen loonkosten in % van omzet. |
| `ref` | nee | Id uit het roostersysteem |

## Temperatuur (koelcellen en vriezers, HACCP)

| Veld | Verplicht | Uitleg |
|---|---|---|
| `sensor` | ja | Naam van de sensor, bijvoorbeeld `Koelcel 1` |
| `tijd` | ja | Moment van meten, met tijdzone |
| `temp` | ja | Graden Celsius |
| `soort` | nee | `koeling` (standaard), `vriezer` of `overig` |
| `min`, `max` | nee | Eigen grenzen. Standaard: koeling 0 tot 7 °C, vriezer -18 °C of kouder |

Opnieuw sturen van dezelfde meting (sensor + tijd) is veilig.

## Google Bedrijfsprofiel (één rij per dag)

| Veld | Uitleg |
|---|---|
| `datum` | Verplicht, `2026-11-01` |
| `zoeken`, `maps` | Weergaven van het profiel in Google Zoeken en Google Maps |
| `routes`, `bellen`, `website`, `reserveren` | Aantal keer route gevraagd, gebeld, naar de website, op reserveren of menu geklikt |

Bron: Business Profile Performance API (`fetchMultiDailyMetricsTimeSeries`).

## Evenement (wat er in de buurt gebeurt)

| Veld | Verplicht | Uitleg |
|---|---|---|
| `datum` | ja | Eerste dag |
| `naam` | ja | Bijvoorbeeld `Thuiswedstrijd Feyenoord` |
| `tot` | nee | Laatste dag bij meerdaagse evenementen |
| `drukte` | nee | `rustig`, `normaal`, `druk` (standaard) of `zeer_druk` |
| `alle_locaties` | nee | `true` = geldt voor alle locaties van de klant |

Weer, feestdagen en schoolvakanties hoef je niet aan te leveren: die haalt het dashboard zelf op
(weer via Open-Meteo op basis van de plaats van de locatie, schoolvakanties via de regio van de locatie).

## Voorbeeld

```json
{
  "locatie_id": "…",
  "bonnen": [{
    "ref": "10231", "tijd": "2026-11-01T21:14:00+01:00", "couverts": 4, "tafel": "12",
    "medewerker": "Sanne", "betaalwijze": "pin", "fooi": 2.5,
    "regels": [
      { "artikel": "Burger", "groep": "Keuken", "aantal": 2, "bedrag": 37.00, "btw_pct": 9 },
      { "artikel": "Pilsner", "groep": "Bier", "aantal": 4, "bedrag": 16.80, "btw_pct": 21 }
    ]
  }],
  "uren": [{ "datum": "2026-11-01", "medewerker": "Sanne", "gepland": 6, "gewerkt": 6.5, "kosten": 140 }]
}
```

## Wat het dashboard hieruit haalt

Omzet per dag, uur, groep, artikel en medewerker · aantal bonnen · couverts en omzet per gast · pin/contant ·
fooi en korting · loonkosten in % van omzet. Alles op **bedrijfsdag**, dus een avond die tot 02:00 duurt blijft
bij één dag.

## Controle

Stuur met `"dry_run": true` mee om te testen zonder iets op te slaan. Bij fouten schrijft `/api/ingest` niets weg
(tenzij je `"deels": true` meestuurt) en krijg je per bon te lezen wat er mist.
