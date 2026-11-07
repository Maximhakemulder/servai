// SERVAI · haalt de cijfers van één zaak op (voor adviezen en de assistent) en maakt er een compacte samenvatting van.
import { samenvatFeiten } from "./advies-ai.mjs";
export const dag = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
export async function haalFeiten(get, k, l) {
  const L = `&locatie_id=eq.${l.id}`;
  const [omzet, loon, reserv, rooster, weer, evenementen, prijzen, gerechten, uren, groepen, artikelen] = await Promise.all([
    get(`omzet_per_dag?klant_id=eq.${k.id}${L}&bedrijfsdag=gte.${dag(-35)}&select=bedrijfsdag,omzet,bonnen,couverts&limit=2000`),
    get(`loonkosten_per_dag?klant_id=eq.${k.id}${L}&datum=gte.${dag(-35)}&select=datum,omzet,loonkosten,gewerkt_uren&limit=2000`),
    get(`reserveringen?klant_id=eq.${k.id}${L}&tijdstip=gte.${dag(0)}&tijdstip=lt.${dag(15)}&status=neq.geannuleerd&select=tijdstip,personen&limit=5000`),
    get(`rooster?klant_id=eq.${k.id}${L}&datum=gte.${dag(0)}&datum=lt.${dag(15)}&select=datum,uren&limit=5000`),
    get(`weer_dagen?klant_id=eq.${k.id}${L}&datum=gte.${dag(0)}&datum=lt.${dag(8)}&select=datum,code,temp_max,temp_min,regenkans,wind_max&order=datum&limit=100`),
    get(`evenementen?klant_id=eq.${k.id}&or=(locatie_id.eq.${l.id},locatie_id.is.null)&datum=gte.${dag(0)}&datum=lt.${dag(15)}&select=datum,tot,naam,drukte&limit=50`),
    get(`factuur_prijswijzigingen?klant_id=eq.${k.id}&select=omschrijving,leverancier,vorige_prijs,prijs,pct,eenheid&limit=200`),
    get(`gerecht_kostprijs?klant_id=eq.${k.id}&select=naam,groep,verkoopprijs,kostprijs&limit=500`),
    get(`omzet_per_uur?klant_id=eq.${k.id}${L}&bedrijfsdag=gte.${dag(-28)}&select=bedrijfsdag,uur,omzet&limit=20000`),
    get(`verkoop_per_groep_dag?klant_id=eq.${k.id}${L}&bedrijfsdag=gte.${dag(-56)}&select=bedrijfsdag,groep,aantal,omzet&limit=20000`),
    get(`verkoop_per_artikel_dag?klant_id=eq.${k.id}${L}&bedrijfsdag=gte.${dag(-56)}&select=bedrijfsdag,artikel,aantal,omzet&limit=50000`),
  ]);
  return samenvatFeiten({ klant: k, zaak: l.naam, omzet, loon, reserv, rooster, weer, evenementen, prijzen, gerechten, uren, groepen, artikelen });
}
