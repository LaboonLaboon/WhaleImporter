Hooks.once('init', () => console.log("Whale Importer | Initializing v1.4.0"));

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
  if (data.entityType==='Actor'&& !data.type) throw new Error('Missing Actor type');
}

/** Map raw data to system schema for each item type */
function mapItemData(type, d) {
  const m = {};
  // universal mappings
  if (d.description) m.description = { value: d.description };
  if (d.price != null) m.price = d.price;
  if (d.category) m.category = d.category;
  if (d.rarity) m.rarity = d.rarity;
  if (d.slots != null) m.slots = d.slots;
  if (d.conceal != null) m.conceal = !!d.conceal;
  if (d.brand) m.brand = d.brand;
  switch(type) {
    case 'weapon':
      m.ROF = d.rof; m.damage = d.damage;
      m.ranged = !(d.melee||d.type==='melee');
      m.weaponType = d.weaponType||d.category; m.skill=d.skill;
      m.hands = d.handsRequired; m.conceal = !!d.conceal;
      m.magazineSize = d.magazine; m.loadedAmmo=d.loadedAmmo||d.ammo;
      m.compatibleAmmo = d.ammoType;
      m.dvTable = d.dvTable;
      m.autofire = d.autofire; m.suppressive = !!d.suppressive;
      if (Array.isArray(d.attachments)) m.attachments = d.attachments;
      if (d.special) m.special = d.special;
      break;
    case 'armor':
      m.SP = d.sp; m.location = d.location; break;
    case 'clothing':
      m.amount = d.amount; m.electronic = !!d.electronic;
      m.providesHardening = !!d.providesHardening;
      break;
    case 'cyberware': case 'upgrade': case 'program': case 'gear':
      // handle special flags for electronics
      m.electronic = !!d.electronic;
      if (d.providesHardening!=null) m.providesHardening = !!d.providesHardening;
      if (d.special) m.special = d.special;
      break;
    case 'ammo': {
      // Ammo sheet fields
      m.amount = d.amount != null ? d.amount : 1;
      m.quantity = d.quantity != null ? d.quantity : m.amount;
      if (d.variety) m.variety = d.variety;
      if (d.type) m.type = d.type;
      if (d.ablationAmount != null) m.ablationAmount = d.ablationAmount;
      if (d.modifyDamage != null) m.modifyDamage = !!d.modifyDamage;
      if (d.modifyAutofireMax != null) m.modifyAutofireMax = !!d.modifyAutofireMax;
      break;
    }
    case 'vehicle': {
      // Vehicle sheet fields
      if (d.structuralDamagePoints != null) m.structuralDamagePoints = d.structuralDamagePoints;
      if (d.seats != null) m.seats = d.seats;
      if (d.combatSpeed != null) m.combatSpeed = d.combatSpeed;
      if (d.speedNarrative != null) m.speedNarrative = d.speedNarrative;
      if (d.slots != null) m.slots = d.slots;
      break;
    }
    case 'skill':
      m.category = d.category; m.difficulty=d.difficulty;
      m.basic = !!d.basic; m.level=d.level; m.stat=d.stat;
      break;
    case 'role':
      m.mainAbilityName = d.mainAbilityName; m.abilityRank=d.abilityRank;
      m.hasRoll = !!d.hasRoll; m.addRoleAbilityRank=!!d.addRoleAbilityRank;
      m.stat=d.stat; m.skill=d.skill;
      break;
    case 'program':
      m.programSize=d.programSize; m.class=d.class;
      m.ATK=d.ATK; m.DEF=d.DEF; m.REZ=d.REZ;
      break;
    case 'architecture':
      m.layers = d.layers; m.DV=d.DV; break;
    case 'cyberdeck':
      m.electronic=!!d.electronic; m.providesHardening=!!d.providesHardening; break;
    case 'critical':
      m.location=d.location; m.quickFixType=d.quickFixType;
      m.quickFixDV=d.quickFixDV; m.treatmentType=d.treatmentType;
      m.treatmentDV=d.treatmentDV; m.increasesDeathSave=!!d.increasesDeathSave;
      break;
  }
  return m;
}

/** Create an Item document */
async function createItemDocument(e) {
  const payload={ name:e.name,type:e.type,system:mapItemData(e.type,e.data||{}),img:e.img };
  return Item.create(payload);
}

/** Import loop */
async function processImportPayload(raw) {
  const arr=Array.isArray(raw)?raw:[raw];
  for(const e of arr){validateEntity(e);
    if(e.entityType==='Item') await createItemDocument(e);
    else if(e.entityType==='Actor'){
      const act=await Actor.create({name:e.name,type:e.type,system:{stats:e.data.stats,role:e.data.role,reputation:e.data.reputation||0},img:e.img});
      // embed weapons
      const items=[];
      (e.data.weapons||[]).forEach(w=>items.push({entityType:'Item',type:'weapon',name:w.name,data:w,img:w.img}));
      (e.data.armor?[{entityType:'Item',type:'armor',name:e.data.armor.name,data:e.data.armor,img:e.data.armor.img}]:[]).forEach(x=>items.push(x));
      ['gear','cyberware','upgrades','programs','architecture','vehicle','clothing','critical','skill','role','cyberdeck','ammo'].forEach(key=>{
        (e.data[key]||[]).forEach(i=>items.push({entityType:'Item',type:key,name:i.name||i,data:i,img:i.img}));
      });
      const docs=await Promise.all(items.map(i=>({name:i.name,type:i.type,system:mapItemData(i.type,i.data||{}),img:i.img})).map(o=>act.createEmbeddedDocuments('Item',[o])));
      // skills
      if(e.data.skills) await act.update({'system.skills':e.data.skills});
    } else if(e.entityType==='RollTable'){
      await RollTable.create({name:e.name,img:e.img,results:e.results});
    }
  }
  ui.notifications.info('Whale Importer | Import complete');
}

/** Import dialog */
class WhaleImportDialog extends FormApplication{
  static get defaultOptions(){return mergeObject(super.defaultOptions,{id:'whale-importer-dialog',title:'Import from The Whale',template:'modules/whale-importer/templates/import-dialog.html',width:600,closeOnSubmit:true});}
  getData(){return{};}
  async _updateObject(ev,fd){
    let raw=this.element.find('textarea[name="json-input"]').val();
    try{const payload=JSON.parse(raw); await processImportPayload(payload);}catch(err){ui.notifications.error('Import failed: '+err.message);}  }
}