Hooks.once('init', () => console.log("Whale Importer | Initializing v1.4.1"));

// Inject import button into the Actors directory
Hooks.on('renderActorDirectory', (app, html) => {
  // Ensure this is the Actor directory
  if (app.documentName !== 'Actor') return;
  // Prevent duplicates
  if (html.find('.import-whale').length) return;
  const footer = html.find('.directory-footer');
  const btn = $(
    `<button class='import-whale btn'>
       <i class='fas fa-file-import'></i> Import from Whale
     </button>`
  );
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
 * Map raw data to system schema for each item type
 */
function mapItemData(type, d) {
  const system = {};
  // Universal
  if (d.description) system.description = { value: d.description };
  if (d.price != null) system.price = d.price;
  if (d.category) system.category = d.category;
  if (d.rarity) system.rarity = d.rarity;
  if (d.slots != null) system.slots = d.slots;
  if (d.brand) system.brand = d.brand;
  // Type-specific
  switch (type) {
    case 'weapon':
      system.rof = d.rof;
      system.damage = d.damage;
      system.rangedWeapon = !!d.rangedWeapon;
      system.weaponType = d.weaponType;
      system.skill = d.skill;
      system.handsRequired = d.handsRequired;
      system.conceal = !!d.conceal;
      system.magazineSize = d.magazine;
      system.loadedAmmo = d.loadedAmmo;
      system.compatibleAmmo = d.ammoType;
      system.dvTable = d.dvTable;
      system.autofire = d.autofire;
      system.suppressive = !!d.suppressive;
      system.attachments = d.attachments || [];
      system.special = d.special;
      break;
    case 'armor':
      system.SP = d.sp;
      system.location = d.location;
      break;
    case 'clothing':
      system.amount = d.amount;
      system.electronic = !!d.electronic;
      system.providesHardening = !!d.providesHardening;
      break;
    case 'cyberware':
    case 'upgrade':
    case 'gear':
      system.electronic = !!d.electronic;
      system.providesHardening = !!d.providesHardening;
      system.special = d.special;
      break;
    case 'program':
      system.programSize = d.programSize;
      system.class = d.class;
      system.ATK = d.ATK;
      system.DEF = d.DEF;
      system.REZ = d.REZ;
      break;
    case 'architecture':
      system.layers = d.layers;
      system.DV = d.DV;
      break;
    case 'critical':
      system.location = d.location;
      system.quickFixType = d.quickFixType;
      system.quickFixDV = d.quickFixDV;
      system.treatmentType = d.treatmentType;
      system.treatmentDV = d.treatmentDV;
      system.increasesDeathSave = !!d.increasesDeathSave;
      break;
    case 'ammo':
      system.amount = d.amount;
      system.quantity = d.quantity;
      system.variety = d.variety;
      system.type = d.type;
      system.ablationAmount = d.ablationAmount;
      system.modifyDamage = !!d.modifyDamage;
      system.modifyAutofireMax = !!d.modifyAutofireMax;
      break;
    case 'vehicle':
      system.structuralDamagePoints = d.structuralDamagePoints;
      system.seats = d.seats;
      system.combatSpeed = d.combatSpeed;
      system.speedNarrative = d.speedNarrative;
      break;
    case 'skill':
      system.category = d.category;
      system.difficulty = d.difficulty;
      system.basic = !!d.basic;
      system.level = d.level;
      system.stat = d.stat;
      break;
    case 'role':
      system.mainAbilityName = d.mainAbilityName;
      system.abilityRank = d.abilityRank;
      system.hasRoll = !!d.hasRoll;
      system.addRoleAbilityRank = !!d.addRoleAbilityRank;
      system.stat = d.stat;
      system.skill = d.skill;
      break;
    case 'cyberdeck':
      system.electronic = !!d.electronic;
      system.providesHardening = !!d.providesHardening;
      break;
    default:
      break;
  }
  return system;
}

/** Create an Item document with system data */
async function createItemDocument(e) {
  const sys = mapItemData(e.type, e.data || {});
  return Item.create({ name: e.name, type: e.type, system: sys, img: e.img });
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
      const items = [];
      (e.data.weapons || []).forEach(w => items.push({ entityType: 'Item', type: 'weapon', name: w.name, data: w, img: w.img }));
      if (e.data.armor) items.push({ entityType: 'Item', type: 'armor', name: e.data.armor.name, data: e.data.armor, img: e.data.armor.img });
      ['gear','cyberware','upgrades','programs','architecture','vehicle','clothing','critical','skill','role','cyberdeck','ammo'].forEach(key => {
        (e.data[key] || []).forEach(i => items.push({ entityType: 'Item', type: key, name: i.name || i, data: i, img: i.img }));
      });
      const embedded = items.map(i => ({ name: i.name, type: i.type, system: mapItemData(i.type, i.data || {}), img: i.img }));
      await actor.createEmbeddedDocuments('Item', embedded);
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
}Hooks.once('init', () => console.log("Whale Importer | Initializing v1.4.2"));

// Add Import button to Actors directory
Hooks.on('renderActorDirectory', (actorDirectory, html) => {
  // Prevent duplicates
  if (html.find('.import-whale').length) return;
  // Find the footer and append our button
  const footer = html.find('.directory-footer');
  const btn = $(
    `<button class="import-whale btn">
       <i class="fas fa-file-import"></i> Import from Whale
     </button>`
  );
  btn.on('click', () => new WhaleImportDialog().render(true));
  footer.append(btn);
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