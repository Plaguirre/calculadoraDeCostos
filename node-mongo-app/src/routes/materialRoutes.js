const express = require('express');
const router = express.Router();
const materialController = require('../controllers/materialController');
const authMiddleware = require('../middlewares/authMiddleware');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

router.get('/', materialController.getMaterials);
router.post('/', materialController.addMaterialValidators, materialController.addMaterial);
router.post('/merge', materialController.mergeMaterials);
router.put('/:id', materialController.updateMaterialValidators, materialController.updateMaterial);
router.delete('/:id', materialController.deleteValidator, materialController.deleteMaterial);

module.exports = router;
