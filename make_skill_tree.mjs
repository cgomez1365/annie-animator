// Builds SKILL_TREE.md and skill_tree.html from every skills/*/skill.json + review_scores.json. node make_skill_tree.mjs
import fs from 'node:fs'; import path from 'node:path';
const ROOT = import.meta.dirname, SK = path.join(ROOT, 'skills');
const rev = JSON.parse(fs.readFileSync(path.join(ROOT, 'review_scores.json'), 'utf8'));
const skills = fs.readdirSync(SK).filter(d => fs.existsSync(path.join(SK, d, 'skill.json'))).map(d => ({ dir: d, ...JSON.parse(fs.readFileSync(path.join(SK, d, 'skill.json'), 'utf8')) }));
skills.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const tiers = {}; for (const s of skills) (tiers[s.tier] ||= { name: s.tierName, items: [] }).items.push(s);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const counts = { verified: 0, partial: 0, failed: 0 }; for (const s of skills) counts[s.status] = (counts[s.status] || 0) + 1;
let md = `# Annie the Animator: skill tree\n\n${skills.length} skills in ${Object.keys(tiers).length} tiers on one shared engine. Status: ${counts.verified} verified, ${counts.partial} partial, ${counts.failed} failed. Independent review score: **${rev.overall} / 10** (REVIEW.md).\n\nBuilt 2026-11-19. Start with \`engine/README.md\`, then the skill you need (each folder has SKILL.md, module.mjs, demo.mjs, test.mjs, out/demo.mp4).\n\n`;
for (const [t, T] of Object.entries(tiers)) {
  md += `## Tier ${t}: ${T.name}\n\n| id | skill | status | review | needs | what it does |\n|---|---|---|---|---|---|\n`;
  for (const s of T.items) { const r = rev.skills[s.id] || {}; md += `| ${s.id} | [${s.name}](skills/${s.dir}/SKILL.md) | ${s.status} | ${r.score ?? '-'} | ${(s.prerequisites || []).join(', ') || '-'} | ${s.summary} |\n`; }
  md += '\n';
}
md += `## Honest limits\n${rev.defects.map(d => `- (${d.severity}) ${d.skill}: ${d.defect}`).join('\n')}\n`;
fs.writeFileSync(path.join(ROOT, 'SKILL_TREE.md'), md);
const col = { verified: '#19e08f', partial: '#f59e0b', failed: '#ef4444' };
let h = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Annie skill tree</title><style>
:root{--bg:#0a0c10;--panel:#0d1117;--p2:#11161d;--tx:#cbd5e1;--w:#f8fafc;--mu:#94a3b8;--ac:#00c97a}
@media print{:root{--bg:#fff;--panel:#f6f8fa;--p2:#fff;--tx:#1f2937;--w:#0b1220;--mu:#4b5563}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 system-ui,Inter,sans-serif;padding:28px 18px}
main{max-width:1100px;margin:auto}h1{color:var(--w);margin:0 0 6px;font-size:30px}h2{color:var(--w);margin:34px 0 4px;font-size:21px;border-bottom:2px solid var(--ac);padding-bottom:4px;break-after:avoid}
.sub{color:var(--mu)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px;margin-top:12px}
.card{background:var(--panel);border:1px solid #1f2937;border-radius:12px;padding:12px;break-inside:avoid}.card h3{margin:0 0 2px;color:var(--w);font-size:16px}
.id{color:var(--ac);font-weight:700}.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:700;color:#0a0c10}
.card img{width:100%;border-radius:6px;margin-top:8px;border:1px solid #1f2937}.m{color:var(--mu);font-size:13px}.score{float:right;color:var(--w);font-weight:700}
</style></head><body><main><h1>Annie the Animator: skill tree</h1><p class="sub">${skills.length} skills, ${Object.keys(tiers).length} tiers, one shared engine. ${counts.verified} verified, ${counts.partial} partial. Independent review: <b>${rev.overall} / 10</b>. Built 2026-11-19 by Claude agents; no human has watched the videos yet.</p>`;
for (const [t, T] of Object.entries(tiers)) {
  h += `<h2>Tier ${t}: ${esc(T.name)}</h2><div class="grid">`;
  for (const s of T.items) { const r = rev.skills[s.id] || {}; const img = fs.existsSync(path.join(SK, s.dir, 'out/contact.png')) ? `<img loading="lazy" src="skills/${s.dir}/out/contact.png" alt="">` : '';
    h += `<div class="card"><span class="score">${r.score ?? ''}/10</span><h3><span class="id">${s.id}</span> ${esc(s.name)}</h3><span class="pill" style="background:${col[s.status] || '#94a3b8'}">${s.status}</span> <span class="m">needs ${(s.prerequisites || []).join(', ') || 'nothing'}</span><p>${esc(s.summary)}</p><div class="m">${esc(r.notes || '')}</div>${img}</div>`; }
  h += '</div>';
}
h += `<h2>Honest limits</h2><ul>${rev.defects.map(d => `<li><b>${d.severity}</b> ${esc(d.skill)}: ${esc(d.defect)}</li>`).join('')}</ul></main></body></html>`;
fs.writeFileSync(path.join(ROOT, 'skill_tree.html'), h); console.log('wrote SKILL_TREE.md and skill_tree.html,', skills.length, 'skills', JSON.stringify(counts));
