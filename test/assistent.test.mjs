import test from "node:test";
import assert from "node:assert";
import { beantwoord } from "../netlify/functions/assistent.mjs";

test("beantwoord: stuurt cijfers + vraag, geschiedenis begint met user en eindigt voor de nieuwe vraag", async () => {
  let body;
  const f = globalThis.fetch;
  globalThis.fetch = async (_u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: "text", text: "Omzet € 100." }], usage: { input_tokens: 10, output_tokens: 5 } }) }; };
  let usage;
  try {
    const a = await beantwoord({ vraag: "Omzet?", historie: [{ r: "a", t: "hoi" }, { r: "u", t: "vorige" }, { r: "a", t: "antwoord" }, { r: "u", t: "los" }], feiten: { x: 1 }, model: "m", apiKey: "k", onUsage: (u) => { usage = u; } });
    assert.equal(a, "Omzet € 100.");
    assert.equal(usage.input_tokens, 10);
    assert.deepEqual(body.messages.map((m) => m.role), ["user", "assistant", "user"]);
    assert.match(body.messages[2].content, /Vraag: Omzet\?/);
    assert.match(body.messages[2].content, /"x":1/);
  } finally { globalThis.fetch = f; }
});
