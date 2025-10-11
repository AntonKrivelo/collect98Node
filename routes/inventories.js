import express from 'express';
import {
  getInventories,
  getInventoryById,
  createInventory,
  updateInventory,
  deleteInventory,
} from '../controllers/inventoriesController.js';

const router = express.Router();

router.get('/', getInventories);
router.get('/:id', getInventoryById);
router.post('/', createInventory);
router.put('/:id', updateInventory);
router.delete('/:id', deleteInventory);

export default router;
