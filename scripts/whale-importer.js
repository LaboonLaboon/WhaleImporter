Hooks.once('init', () => console.log("Whale Importer | Initializing v1.5.0"));

// Add Import button to Actors directory header
Hooks.on('renderActorDirectory', (app, html) => {
  if (html.find('.import-whale').length) return;
  const headerActions = html.find('.directory-header .header-actions');
  const btn = $(
    `<button class="import-whale btn"><i class="fas fa-file-import"></i> Import from Whale</button>`
  );
  btn.on('click', () => new WhaleImportDialog().render(true));
  headerActions.append(btn);
});

// Handle postMessage direct exports
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

/** Basic JSON validation */
function validateEntity(data) {
  if (!data.entityType || !['Actor','Item','RollTable'].includes(data.entityType))
    throw new Error('Invalid entityType');
  if (!data.name) throw new Error('Missing name');
  if (data.entityType === 'Item' && !data.type) throw new Error('Missing Item type');
  if (data.entityType === 'Actor' && !data.type) throw new Error('Missing Actor type');
}

/** Map raw JSON fields into CPR core schema */
function mapItemData(type, raw) {
  const sys = {};
  // Universal
  if (raw.description) sys.description = { value: raw.description };
  if (raw.price != null) sys.price = raw.price;
  if (raw.category) sys.category = raw.category;
  if (raw.rarity) sys.rarity = raw.rarity;
  if (raw.slots != null) sys.slots = raw.slots;
  if (raw.brand) sys.brand = raw.brand;

  // Type-specific based on packs/core definitions
  switch (type) {
    case 'weapon': {
      sys.attackmod = raw.attackmod != null ? raw.attackmod : 0;
      sys.rof = raw.rof;
      sys.damage = raw.damage;
      sys.ammoVariety = raw.ammoType ? [raw.ammoType] : [];
      sys.brand = raw.brand || "";
      sys.concealable = { concealable: !!raw.conceal, isConcealed: false };
      sys.critFailEffect = raw.special || "";
      sys.description = { value: raw.description || "" };
      sys.dvTable = raw.dvTable || "";
      sys.equipped = raw.equipped || "owned";
      sys.favorite = raw.favorite != null ? raw.favorite : false;
      sys.fireModes = { autoFire: raw.autofire != null ? raw.autofire : 0, suppressiveFire: !!raw.suppressive };
      sys.handsReq = raw.handsRequired || 1;
      sys.installedItems = {
        allowed: true,
        allowedTypes: ["itemUpgrade","ammo"],
        list: [],
        slots: raw.slots || 0,
        usedSlots: 0
      };
      sys.isRanged = !!raw.rangedWeapon;
      sys.magazine = { max: raw.magazine || 0, value: raw.loadedAmmo || 0 };
      sys.price = { market: raw.price != null ? raw.price : 0 };
      sys.quality = raw.quality || raw.rarity || "standard";
      sys.revealed = raw.revealed != null ? raw.revealed : true;
      sys.source = raw.source || { book: "Core", page: 0 };
      sys.unarmedAutomaticCalculation = raw.unarmedAutomaticCalculation != null ? raw.unarmedAutomaticCalculation : true;
      sys.usage = raw.usage || "equipped";
      sys.usesType = raw.usesType || "magazine";
      sys.weaponSkill = raw.skill;
      sys.weaponType = raw.weaponType ? raw.weaponType.toLowerCase().replace(/ /g, "") : "";
      break;
    }
    case 'armor':
      sys.sp = raw.sp;
      sys.location = raw.location;
      break;
    case 'clothing':
      sys.amount = raw.amount;
      sys.electronic = !!raw.electronic;
      sys.providesHardening = !!raw.providesHardening;
      break;
    case 'cyberware':
    case 'upgrade':
    case 'gear':
      sys.electronic = !!raw.electronic;
      sys.providesHardening = !!raw.providesHardening;
      sys.special = raw.special || '';
      break;
    case 'program':
      sys.programSize = raw.programSize;
      sys.class = raw.class;
      sys.atk = raw.ATK;
      sys.def = raw.DEF;
      sys.rez = raw.REZ;
      break;
    case 'architecture':
      sys.layers = raw.layers;
      sys.dv = raw.DV;
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
      sys.amount = raw.amount ?? 1;
      sys.quantity = raw.quantity ?? sys.amount;
      sys.variety = raw.variety;
      sys.type = raw.type;
      sys.ablationAmount = raw.ablationAmount || 0;
      sys.modifyDamage = !!raw.modifyDamage;
      sys.modifyAutofireMax = !!raw.modifyAutofireMax;
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

/** Create an Item document */
async function createItemDocument(entry) {
  const systemData = mapItemData(entry.type, entry.data || {});
  return Item.create({ name: entry.name, type: entry.type, system: systemData, img: entry.img });
}

/** Import loop: Items, Actors, RollTables */
async function processImportPayload(raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  for (const e of entries) {
    validateEntity(e);
    if (e.entityType === 'Item') {
      await createItemDocument(e);
    } else if (e.entityType === 'Actor') {
      const actor = await Actor.create({ name: e.name, type: e.type, system: { stats: e.data.stats, role: e.data.role, reputation: e.data.reputation || 0 }, img: e.img });
      const items = [];
      (e.data.weapons || []).forEach(w => items.push({ type: 'weapon', name: w.name, data: w, img: w.img }));
      if (e.data.armor) items.push({ type: 'armor', name: e.data.armor.name, data: e.data.armor, img: e.data.armor.img });
      ['gear','cyberware','upgrades','programs','architecture','vehicle','clothing','critical','skill','role','cyberdeck','ammo'].forEach(key => {
        (e.data[key] || []).forEach(i => items.push({ type: key, name: i.name || i, data: i, img: i.img }));
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
  async _updateObject() {
    const raw = this.element.find('textarea[name="json-input"]').val();
    try { const payload = JSON.parse(raw); await processImportPayload(payload); }
    catch (err) { ui.notifications.error('Import failed: ' + err.message); }
  }
}