Hooks.once('init', () => {
  console.log("Whale Importer | Initializing v1.3.0");
});

// Add import button in Actor directory
Hooks.on('renderActorDirectory', (app, html) => {
  if (html.find('.import-whale').length) return;
  const footer = html.find('.directory-footer');
  const btn = $(`<button class='import-whale btn'><i class='fas fa-file-import'></i> Import from Whale</button>`);
  btn.on('click', () => new WhaleImportDialog().render(true));
  footer.prepend(btn);
});

/**
 * Validate the top-level structure
 */
function validateEntity(data) {
  if (!data.entityType || !['Actor','Item','RollTable'].includes(data.entityType))
    throw new Error('Missing or invalid `entityType` (must be Actor, Item, or RollTable)');
  if (!data.name) throw new Error('Missing `name`');
  if (data.entityType === 'Item' && !data.type)
    throw new Error('Missing Item `type` (e.g., weapon, armor)');
  if (data.entityType === 'Actor' && !data.type)
    throw new Error('Missing Actor `type` (e.g., mook, character)');
}

/**
 * Map generic JSON fields to the Cyberpunk RED Item schema
 */
function mapItemData(type, rawData) {
  const mapped = {};
  // Common fields
  if (rawData.description) mapped.description = { value: rawData.description };
  if (rawData.price != null) mapped.price = rawData.price;
  if (rawData.rarity) mapped.rarity = rawData.rarity;
  if (rawData.category) mapped.category = rawData.category;

  switch (type) {
    case 'weapon':
      mapped.ROF = rawData.rof;
      mapped.damage = rawData.damage;
      mapped.skill = rawData.type === 'melee' ? 'Brawling' : 'Handgun';
      mapped.hands = rawData.handsRequired || 1;
      mapped.conceal = !!rawData.conceal;
      mapped.magazineSize = rawData.magazine || rawData.ammo;
      mapped.loadedAmmo = rawData.ammo || rawData.magazine;
      mapped.dvTable = rawData.range ? `DV ${rawData.range}` : null;
      mapped.autofire = rawData.autofire || 1;
      mapped.suppressive = !!rawData.suppressive;
      if (rawData.ammoType) mapped.ammoType = rawData.ammoType;
      break;
    case 'armor':
      mapped.SP = rawData.sp;
      mapped.location = rawData.location;
      break;
    case 'ammo':
      mapped.quantity = rawData.quantity;
      break;
    // Add other item types as needed
    default: break;
  }

  // Attachments or upgrades
  if (Array.isArray(rawData.attachments)) mapped.attachments = rawData.attachments;
  if (rawData.slots != null) mapped.slots = rawData.slots;
  return mapped;
}

/**
 * Create an independent Item document
 */
async function createItemDocument(data) {
  const itemType = data.type;
  const itemPayload = {
    name: data.name,
    type: itemType,
    system: mapItemData(itemType, data.data || {}),
    img: data.img || undefined
  };
  return Item.create(itemPayload);
}

/**
 * Process and import payload: Actors, individual Items, or RollTables.
 */
async function processImportPayload(raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  for (const entry of entries) {
    validateEntity(entry);
    if (entry.entityType === 'Item') {
      await createItemDocument(entry);
    }
    else if (entry.entityType === 'Actor') {
      // Create actor with base attributes
      const aType = entry.type;
      const actorData = {
        name: entry.name,
        type: aType,
        system: {
          stats: entry.data.stats,
          role: entry.data.role,
          reputation: entry.data.reputation || 0
        },
        img: entry.img || undefined
      };
      const actor = await Actor.create(actorData, { renderSheet: true });
      // Create embedded items (weapons, armor, gear, cyberware, etc.)
      const itemsToImport = [];
      for (const w of entry.data.weapons || []) itemsToImport.push({ ...w, entityType: 'Item', type: 'weapon' });
      for (const g of entry.data.gear || [])    itemsToImport.push({ ...g, entityType: 'Item', type: 'gear' });
      for (const a of entry.data.armor ? [entry.data.armor] : []) itemsToImport.push({ ...a, entityType: 'Item', type: 'armor' });
      for (const c of entry.data.cyberware || []) itemsToImport.push({ ...c, entityType: 'Item', type: 'cyberware' });
      // Map each to valid create payload
      const embedded = itemsToImport.map(i => ({
        name: i.name,
        type: i.type,
        system: mapItemData(i.type, i),
        img: i.img || undefined
      }));
      await actor.createEmbeddedDocuments('Item', embedded);
      // Skills integration
      if (entry.data.skills) {
        await actor.update({
          'system.skills': entry.data.skills
        });
      }
    }
    else if (entry.entityType === 'RollTable') {
      await RollTable.create({ name: entry.name, img: entry.img, results: entry.results });
    }
  }
  ui.notifications.info('Whale Importer | Import complete');
}

/**
 * Dialog for pasting JSON
 */
class WhaleImportDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'whale-importer-dialog',
      title: 'Import from The Whale',
      template: 'modules/whale-importer/templates/import-dialog.html',
      width: 600,
      closeOnSubmit: true
    });
  }
  getData() { return {}; }
  async _updateObject(event, formData) {
    const raw = this.element.find('textarea[name="json-input"]').val();
    let payload;
    try { payload = JSON.parse(raw); }
    catch { return ui.notifications.error('Invalid JSON'); }
    try { await processImportPayload(payload); }
    catch (err) { ui.notifications.error(`Import failed: ${err.message}`); }
  }
}