// Versleutelt inloggegevens van koppelingen (AES-256-GCM) voordat ze in koppeling_geheimen komen.
// De sleutel staat alleen in de omgevingsvariabele KOPPELING_SLEUTEL (base64, 32 bytes), nooit in de database.
// Genereren: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const sleutel = () => {
  const k = Buffer.from(process.env.KOPPELING_SLEUTEL || "", "base64");
  if (k.length !== 32) throw new Error("KOPPELING_SLEUTEL ontbreekt of is geen 32 bytes (base64)");
  return k;
};

export function versleutel(obj) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", sleutel(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${ct.toString("base64")}`;
}

export function ontsleutel(tekst) {
  const [v, iv, tag, ct] = String(tekst).split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Onbekend formaat van versleutelde gegevens");
  const d = createDecipheriv("aes-256-gcm", sleutel(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8"));
}
