// Whale Importer for Cyberpunk RED Foundry VTT
console.log('🐋 Whale Importer | Script loaded');

// Use init hook to ensure Foundry loads our script early
Hooks.once('init', () => {
  console.log('🐋 Whale Importer | init hook');
  // Add the import button when the Actors directory renders
  Hooks.on('renderActorDirectory', (actorDirectory, html) => {
    console.log('🐋 Whale Importer | renderActorDirectory fired');
    // Prevent duplicate buttons
    if (html.find('.import-whale').length) return;
    // Append import button to the footer
    const footer = html.find('.directory-footer');
    const btn = $(
      `<button class="import-whale btn">
         <i class="fas fa-file-import"></i> Import from Whale
       </button>`
    );
    btn.on('click', () => new WhaleImportDialog().render(true));
    footer.append(btn);
  });
});

/** Validate top-level JSON structure */
function validateEntity(data) {
  if (!data.entityType || !['Actor','Item','RollTable'].includes(data.entityType))
    throw new Error('Invalid entityType: ' + data.entityType);
  if (!data.name) throw new Error('Missing name');
  if (data.entityType === 'Item' && !data.type) throw new Error('Missing Item type');
  if (data.entityType === 'Actor' && !data.type) throw new Error('Missing Actor type');
}

/** Map raw data to system schema for each item type */
function mapItemData(type, raw) {
  const sys = {};
  // Universal fields
  if (raw.description)       sys.description        = { value: raw.description };
  if (raw.price != null)     sys.price              = { market: raw.price };
  if (raw.category)          sys.category           = raw.category;
  if (raw.quality)           sys.quality            = raw.quality;
  if (raw.revealed != null)  sys.revealed           = !!raw.revealed;
  if (raw.favorite != null)  sys.favorite           = !!raw.favorite;

  switch (type) {
    // ... full per-case mappings as previously defined ...
  }
  return sys;
}

/** Process and import JSON payload */
async function processImportPayload(raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  for (const entry of entries) {
    validateEntity(entry);
    if (entry.entityType === 'Item') {
      const systemData = mapItemData(entry.type, entry.data || {});
      await Item.create({ name: entry.name, type: entry.type, system: systemData, img: entry.img });
    } else if (entry.entityType === 'Actor') {
      const actor = await Actor.create({ name: entry.name, type: entry.type, system: { stats: entry.data.stats, role: entry.data.role, reputation: entry.data.reputation || 0 }, img: entry.img });
      const items = [];
      (entry.data.weapons || []).forEach(w => items.push({ type: 'weapon', name: w.name, data: w, img: w.img }));
      if (entry.data.armor) items.push({ type: 'armor', name: entry.data.armor.name, data: entry.data.armor, img: entry.data.armor.img });
      ['gear','cyberware','upgrade','program','architecture','vehicle','clothing','critical','skill','role','cyberdeck','ammo'].forEach(key => {
        (entry.data[key] || []).forEach(i => items.push({ type: key, name: i.name || i, data: i, img: i.img }));
      });
      const embedded = items.map(i => ({ name: i.name, type: i.type, system: mapItemData(i.type, i.data || {}), img: i.img }));
      await actor.createEmbeddedDocuments('Item', embedded);
      if (entry.data.skills) await actor.update({ 'system.skills': entry.data.skills });
    } else if (entry.entityType === 'RollTable') {
      await RollTable.create({ name: entry.name, img: entry.img, results: entry.results });
    }
  }
  ui.notifications.info('🐋 Whale Importer | Import complete');
}

/** Dialog for JSON import */
class WhaleImportDialog extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, { id: 'whale-importer-dialog', title: 'Import from Whale', template: 'modules/whale-importer/templates/import-dialog.html', width: 600, closeOnSubmit: true });
  }
  getData() { return {}; }
  async _updateObject(event) {
    const raw = this.element.find('textarea[name="json-input"]').val();
    try { const payload = JSON.parse(raw); await processImportPayload(payload); }
    catch (err) { ui.notifications.error('Import failed: ' + err.message); }
  }
}
