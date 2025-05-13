Hooks.once('init', () => console.log("Whale Importer | Initializing v1.4.2"));

// Add Import button to Actors directory
// Add Import button to Actors directory header
Hooks.on('renderActorDirectory', (actorDirectory, html) => {
  // Prevent duplicates
  if (html.find('.import-whale').length) return;
  // Insert button into the header actions for visibility
  const headerActions = html.find('.directory-header .header-actions');
  const btn = $(
    `<button class="import-whale btn">
       <i class="fas fa-file-import"></i> Import from Whale
     </button>`
  );
  btn.on('click', () => new WhaleImportDialog().render(true));
  headerActions.append(btn);
});

// Listen for direct exports via postMessage
window.addEventListener('message', async event => {
  if (event.origin !== 'https://chatgpt.com') return;
  const payload = event.data?.whaleImport;
  if (!payload) return;
  try {
    await processImportPayload(payload);
    ui.notifications.info('Whale Importer | Direct import complete');
  } catch (err) {
    ui.notifications.error(`Whale Importer | Direct import failed: ${err.message}`);
  }
});

/** Validate top-level JSON structure */
function validateEntity(data) {
  if (!data.entityType || !['Actor','Item','RollTable'].includes(data.entityType))
    throw new Error('Invalid entityType');
  if (!data.name) throw new Error('Missing name');
  if (data.entityType === 'Item' && !data.type) throw new Error('Missing Item type');
  if (data.entityType === 'Actor' && !data.type) throw new Error('Missing Actor type');
}

/** Map raw item data onto system fields */
function mapItemData(type, raw) {
  const sys = {};
  // Universal fields
  if (raw.description) sys.description = { value: raw.description };
  if (raw.price != null) sys.price = raw.price;
  if (raw.category) sys.category = raw.category;
  if (raw.rarity) sys.rarity = raw.rarity;
  if (raw.slots != null) sys.slots = raw.slots;
  if (raw.brand) sys.brand = raw.brand;
  // Type-specific
  switch (type) {
    case 'weapon':
      sys.rof = raw.rof;
      sys.damage = raw.damage;
      sys.rangedWeapon = !!raw.rangedWeapon;
      sys.weaponType = raw.weaponType;
      sys.skill = raw.skill;
      sys.handsRequired = raw.handsRequired;
      sys.conceal = !!raw.conceal;
      sys.magazineSize = raw.magazine;
      sys.loadedAmmo = raw.loadedAmmo;
      sys.compatibleAmmo = raw.ammoType;
      sys.dvTable = raw.dvTable;
      sys.autofire = raw.autofire;
      sys.suppressive = !!raw.suppressive;
      sys.attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
      sys.special = raw.special;
      break;
    case 'armor':
      sys.SP = raw.sp;
      sys.location = raw.location;
      break;
    case 'clothing':
      sys.amount = raw.amount;
      sys.electronic = !!raw.electronic;
      sys.providesHardening = !!raw.providesHardening;
      break;
    case 'cyberware': case 'upgrade': case 'gear':
      sys.electronic = !!raw.electronic;
      sys.providesHardening = !!raw.providesHardening;
      sys.special = raw.special;
      break;
    case 'program':
      sys.programSize = raw.programSize;
      sys.class = raw.class;
      sys.ATK = raw.ATK;
      sys.DEF = raw.DEF;
      sys.REZ = raw.REZ;
      break;
    case 'architecture':
      sys.layers = raw.layers;
      sys.DV = raw.DV;
      break;
    case 'critical':
      sys.location = raw.location;
      sys.quickFixType = raw.quickFixType;
      sys.quickFixDV = raw.quickFixDV;
      sys.treatmentType = raw.treatmentType;
      sys.treatmentDV = raw.treatmentDV;
      sys.increasesDeathSave = !!raw.increasesDeathSave;
      break;
    case 'ammo':
      sys.amount = raw.amount != null ? raw.amount : 1;
      sys.quantity = raw.quantity != null ? raw.quantity : sys.amount;
      if (raw.variety) sys.variety = raw.variety;
      if (raw.type) sys.type = raw.type;
      if (raw.ablationAmount != null) sys.ablationAmount = raw.ablationAmount;
      if (raw.modifyDamage != null) sys.modifyDamage = !!raw.modifyDamage;
      if (raw.modifyAutofireMax != null) sys.modifyAutofireMax = !!raw.modifyAutofireMax;
      break;
    case 'vehicle':
      sys.structuralDamagePoints = raw.structuralDamagePoints;
      sys.seats = raw.seats;
      sys.combatSpeed = raw.combatSpeed;
      sys.speedNarrative = raw.speedNarrative;
      break;
    case 'skill':
      sys.category = raw.category;
      sys.difficulty = raw.difficulty;
      sys.basic = !!raw.basic;
      sys.level = raw.level;
      sys.stat = raw.stat;
      break;
    case 'role':
      sys.mainAbilityName = raw.mainAbilityName;
      sys.abilityRank = raw.abilityRank;
      sys.hasRoll = !!raw.hasRoll;
      sys.addRoleAbilityRank = !!raw.addRoleAbilityRank;
      sys.stat = raw.stat;
      sys.skill = raw.skill;
      break;
    case 'cyberdeck':
      sys.electronic = !!raw.electronic;
      sys.providesHardening = !!raw.providesHardening;
      break;
    default:
      break;
  }
  return sys;
}

/** Create an Item with proper system data */
async function createItemDocument(e) {
  const sys = mapItemData(e.type, e.data || {});
  return Item.create({ name: e.name, type: e.type, system: sys, img: e.img });
}

/** Process JSON payload: Items, Actors, RollTables */
async function processImportPayload(raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  for (const entry of entries) {
    validateEntity(entry);
    if (entry.entityType === 'Item') {
      await createItemDocument(entry);
    } else if (entry.entityType === 'Actor') {
      const actor = await Actor.create({ name: entry.name, type: entry.type, system: { stats: entry.data.stats, role: entry.data.role, reputation: entry.data.reputation || 0 }, img: entry.img });
      const items = [];
      (entry.data.weapons || []).forEach(w => items.push({ type: 'weapon', name: w.name, data: w, img: w.img }));
      if (entry.data.armor) items.push({ type: 'armor', name: entry.data.armor.name, data: entry.data.armor, img: entry.data.armor.img });
      ['gear','cyberware','upgrades','programs','architecture','vehicle','clothing','critical','skill','role','cyberdeck','ammo'].forEach(key => {
        (entry.data[key] || []).forEach(i => items.push({ type: key, name: i.name || i, data: i, img: i.img }));
      });
      const embedded = items.map(i => ({ name: i.name, type: i.type, system: mapItemData(i.type, i.data || {}), img: i.img }));
      await actor.createEmbeddedDocuments('Item', embedded);
      if (entry.data.skills) await actor.update({ 'system.skills': entry.data.skills });
    } else if (entry.entityType === 'RollTable') {
      await RollTable.create({ name: entry.name, img: entry.img, results: entry.results });
    }
  }
  ui.notifications.info('Whale Importer | Import complete');
}

/** Dialog for JSON import */
class WhaleImportDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, { id: 'whale-importer-dialog', title: 'Import from The Whale', template: 'modules/whale-importer/templates/import-dialog.html', width: 600, closeOnSubmit: true });
  }
  getData() { return {}; }
  async _updateObject(event) {
    const raw = this.element.find('textarea[name="json-input"]').val();
    try { const payload = JSON.parse(raw); await processImportPayload(payload); }
    catch (err) { ui.notifications.error('Import failed: ' + err.message); }
  }
}