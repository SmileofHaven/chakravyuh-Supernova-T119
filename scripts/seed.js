// Run: node --env-file=.env.local scripts/seed.js     (Node 20.6+, package.json needs "type": "module")
import fs from "node:fs";
import { db } from "../lib/firebaseAdmin.js";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));

async function put(coll, items, idKey) {
  const batch = db.batch();
  for (const it of items) batch.set(db.collection(coll).doc(it[idKey]), it);
  await batch.commit();
  console.log(`${coll}: ${items.length}`);
}

await put("topics", read("../data/topics.json"), "tag");

const c = read("../data/digital-electronics.json");
for (const coll of ["lessons", "questions", "labs", "challenges", "sims", "gameItems"]) {
  if (c[coll]?.length) await put(coll, c[coll], "id");
}
console.log("done");
process.exit(0);
