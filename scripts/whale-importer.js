Hooks.once('init', () => console.log("Whale Importer | Initializing v1.4.1"));

// Inject import button in Actors directory
Hooks.on('renderActorDirectory', (app, html) => {
  if (html.find('.import-whale').length) return;
  const footer = html.find('.directory-footer');
  const btn = $(`<button class='import-whale btn'><i class='fas fa-file-import'></i> Import from Whale</button>`);
  btn.on('click', () => new WhaleImportDialog().render(true));
  footer.prepend(btn);
});

/** Validate basic JSON structure */
function validateEntity(data) {
  if (!data.entityType || !['Actor','Item','RollTable'].includes(data.entityType))
    throw new Error('Invalid entityType');
  if (!data.name) throw new Error('Missing name');
  if (data.entityType==='Item' && !data.type) throw new Error('Missing Item type');
  if (data.entityType==='Actor' && !data.type) throw new Error('Missing Actor type');
}

/**
 * Map raw data to system schema for each item type,
 * nesting type-specific fields under system.<type>
 */
function mapItemData(type, d) {
  const common = {};
  // universal mappings
  if (d.description) common.description = { value: d.description };
  if (d.price != null) common.price = d.price;
  if (d.category) common.category = d.category;
  if (d.rarity) common.rarity = d.rarity;
  if (d.slots != null) common.slots = d.slots;
  if (d.brand) common.brand = d.brand;

  const nested = {};
  switch(type) {
    case 'weapon': {
      nested.weapon = {
        rof: d.rof,
        damage: d.damage,
        rangedWeapon: !(d.melee === true || d.type === 'melee'),
        weaponType: d.weaponType || d.category,
        skill: d.skill,
        handsRequired: d.handsRequired || 1,
        conceal: !!d.conceal,
        magazineSize: d.magazine,
        loadedAmmo: d.loadedAmmo || d.ammo,
        compatibleAmmo: d.ammoType,
        dvTable: d.dvTable,
        autofire: d.autofire,
        suppressive: !!d.suppressive,
        attachments: Array.isArray(d.attachments) ? d.attachments : [],
        special: d.special || ''
      };
      break;
    }
    case 'armor':
      nested.armor = { SP: d.sp, location: d.location };
      break;
    case 'clothing':
      nested.clothing = { amount: d.amount, electronic: !!d.electronic, providesHardening: !!d.providesHardening };
      break;
    case 'cyberware':
    case 'upgrade':
    case 'program':
    case 'gear':
      nested[type] = { electronic: !!d.electronic, providesHardening: !!d.providesHardening, special: d.special || '' };
      break;
    case 'ammo':
      nested.ammo = {
        amount: d.amount != null ? d.amount : 1,
        quantity: d.quantity != null ? d.quantity : (d.amount != null ? d.amount : 1),
        variety: d.variety || '',
        type: d.type || '',
        ablationAmount: d.ablationAmount || 0,
        modifyDamage: !!d.modifyDamage,
        modifyAutofireMax: !!d.modifyAutofireMax
      };
      break;
    case 'vehicle':
      nested.vehicle = {
        structuralDamagePoints: d.structuralDamagePoints || 0,
        seats: d.seats || 0,
        combatSpeed: d.combatSpeed || 0,
        speedNarrative: d.speedNarrative || '',
        slots: d.slots || 0
      };
      break;
    case 'skill':
      nested.skill = { category: d.category, difficulty: d.difficulty, basic: !!d.basic, level: d.level, stat: d.stat };
      break;
    case 'role':
      nested.role = { mainAbilityName: d.mainAbilityName, abilityRank: d.abilityRank, hasRoll: !!d.hasRoll, addRoleAbilityRank: !!d.addRoleAbilityRank, stat: d.stat, skill: d.skill };
      break;
    case 'program':
      nested.program = { programSize: d.programSize, class: d.class, ATK: d.ATK, DEF: d.DEF, REZ: d.REZ };
      break;
    case 'architecture':
      nested.architecture = { layers: d.layers, DV: d.DV };
      break;
    case 'cyberdeck':
      nested.cyberdeck = { electronic: !!d.electronic, providesHardening: !!d.providesHardening };
      break;
    case 'critical':
      nested.critical = { location: d.location, quickFixType: d.quickFixType, quickFixDV: d.quickFixDV, treatmentType: d.treatmentType, treatmentDV: d.treatmentDV, increasesDeathSave: !!d.increasesDeathSave };
      break;
    default:
      // Unexpected type
      break;
  }

  // Merge common and nested under type key
  return mergeObject(common, nested);
}

/** Create an Item document with nested system data */
async function createItemDocument(e) {
  const sysData = mapItemData(e.type, e.data || {});
  return Item.create({ name: e.name, type: e.type, system: sysData, img: e.img });
}

/** Import loop */
async function processImportPayload(raw) {
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const e of arr) {
    validateEntity(e);
    if (e.entityType === 'Item') {
      await createItemDocument(e);
    } else if (e.entityType === 'Actor') {
      const actor = await Actor.create({ name: e.name, type: e.type, system: { stats: e.data.stats, role: e.data.role, reputation: e.data.reputation || 0 }, img: e.img });
      // Build embedded items
      const items = [];
      (e.data.weapons || []).forEach(w => items.push({ entityType: 'Item', type: 'weapon', name: w.name, data: w, img: w.img }));
      if (e.data.armor) items.push({ entityType: 'Item', type: 'armor', name: e.data.armor.name, data: e.data.armor, img: e.data.armor.img });
      ['gear','cyberware','upgrades','programs','architecture','vehicle','clothing','critical','skill','role','cyberdeck','ammo'].forEach(key => {
        (e.data[key] || []).forEach(i => items.push({ entityType: 'Item', type: key, name: i.name || i, data: i, img: i.img }));
      });
      // Embed items
      const embedded = items.map(i => ({ name: i.name, type: i.type, system: mapItemData(i.type, i.data || {}), img: i.img }));
      await actor.createEmbeddedDocuments('Item', embedded);
      // Update skills
      if (e.data.skills) await actor.update({ 'system.skills': e.data.skills });
    } else if (e.entityType === 'RollTable') {
      await RollTable.create({ name: e.name, img: e.img, results: e.results });
    }
  }
  ui.notifications.info('Whale Importer | Import complete');
}

/** Import dialog */
class WhaleImportDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, { id: 'whale-importer-dialog', title: 'Import from The Whale', template: 'modules/whale-importer/templates/import-dialog.html', width: 600, closeOnSubmit: true });
  }
  getData() { return {}; }
  async _updateObject(event, formData) {
    const raw = this.element.find('textarea[name="json-input"]').val();
    try { const payload = JSON.parse(raw); await processImportPayload(payload); }
    catch (err) { ui.notifications.error('Import failed: ' + err.message); }
  }
}