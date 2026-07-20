// Item tooltip data (OG getitemmouseover2): name, category, weight, every
// non-zero stat, and the indoor/outdoor weapon split (melee ×3 / firearms ×⅔
// indoors). Catalog fetched once per session and cached.
import { getItems } from './net.js';

const catalog = new Map();

export async function loadItems() {
  try {
    const r = await getItems();
    for (const it of (r.items || [])) catalog.set(it.id, it);
  } catch { /* tooltips degrade gracefully without the catalog */ }
}

export function itemInfo(id) { return catalog.get(Number(id)) || null; }

export function itemTip(id) {
  const it = catalog.get(Number(id));
  if (!it) return '';
  const lines = [`${it.name} — ${it.category}`, `Weight: ${it.weight} kg`];
  if (it.attackBonus) {
    const melee = it.ammoItem == null;
    const indoor = melee ? it.attackBonus * 3 : Math.floor(it.attackBonus * 2 / 3);
    lines.push(`⚔ Attack +${it.attackBonus} (indoors ${melee ? '×3' : '×⅔'}: +${indoor})`);
  }
  if (it.defenseBonus) lines.push(`🛡 Defence +${it.defenseBonus}`);
  if (it.healing) lines.push(`❤ Heals ${it.healing} HP`);
  if (it.repairAmount) lines.push(`🔧 Repairs ${it.repairAmount} durability`);
  if (it.maxDurability) lines.push(`Durability: ${it.maxDurability} uses`);
  if (it.ammoItem != null) lines.push(`Ammunition: ${catalog.get(it.ammoItem)?.name || 'required'}`);
  return lines.join('\n');
}
