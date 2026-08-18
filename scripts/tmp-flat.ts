import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:./dev.db" }) });

const DENTAL = [
  "Anaesthetic","Articulating","Dental Burs","Laboratory Burs","CAD/CAM","3D Printing",
  "Crown & Bridge","Disposables","Education & Toys","Endodontics","Dental Equipment",
  "Finishing & Polishing","Handpieces","Impression","Infection Control","Dental Instruments",
  "Dental Laboratory","Oral Surgery","Orthodontics","Preventive","Restorative & Cosmetic",
  "Retraction","Rubber Dam","Dental X-Ray",
];

const cats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
const depts = cats.filter((c) => !c.parentId && DENTAL.includes(c.name));
console.log(`dental departments: ${depts.length}`);

const kids = depts.flatMap((d) =>
  cats.filter((c) => c.parentId === d.id).map((c) => ({ dept: d.name, name: c.name }))
);
console.log(`their sub-categories: ${kids.length}`);
console.log(`flattened under one Dental department that would be: ${depts.length + kids.length} children`);

const counts = new Map<string, string[]>();
for (const k of kids) {
  const key = k.name.toLowerCase();
  counts.set(key, [...(counts.get(key) ?? []), k.dept]);
}
const clashes = [...counts.entries()].filter(([, v]) => v.length > 1);
console.log(`\nnames that would collide as siblings: ${clashes.length}`);
for (const [name, where] of clashes.slice(0, 40)) {
  console.log(`   ${name} — ${where.join(", ")}`);
}
console.log(`\nshelves involved in a collision: ${clashes.reduce((n, [, v]) => n + v.length, 0)}`);
await prisma.$disconnect();
