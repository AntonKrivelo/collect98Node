import Inventory from '../models/Inventory.js';

export async function getInventories(req, res) {
  const { search = '', sort = 'updatedAt', page = 1 } = req.query;
  const PAGE_SIZE = 10;

  const query = search ? { title: { $regex: search, $options: 'i' } } : {};

  const [items, total] = await Promise.all([
    Inventory.find(query)
      .sort({ [sort]: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    Inventory.countDocuments(query),
  ]);

  res.json({ items, page, total });
}

export async function getInventoryById(req, res) {
  const inventory = await Inventory.findById(req.params.id);
  if (!inventory) return res.status(404).json({ error: 'Not found' });
  res.json(inventory);
}

export async function createInventory(req, res) {
  const inv = new Inventory(req.body);
  await inv.save();
  res.status(201).json(inv);
}

export async function updateInventory(req, res) {
  const inv = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(inv);
}

export async function deleteInventory(req, res) {
  await Inventory.findByIdAndDelete(req.params.id);
  res.status(204).end();
}
