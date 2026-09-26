const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/productController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.get('/',        ctrl.getProducts);
router.get('/export',  ctrl.exportValidators, ctrl.exportCatalog);
router.post('/',       ctrl.saveValidators, ctrl.saveProduct);
router.get('/:id',     ctrl.idValidator, ctrl.getProduct);
router.put('/:id',     ctrl.updateValidators, ctrl.updateProduct);
router.patch('/:id',   ctrl.catalogValidators, ctrl.updateCatalog);
router.delete('/:id',  ctrl.idValidator, ctrl.deleteProduct);

router.post('/:id/images',                   ctrl.idValidator, ctrl.uploadMiddleware, ctrl.addImages);
router.delete('/:id/images/:imageId',        ctrl.imageValidators, ctrl.deleteImage);
router.patch('/:id/images/:imageId/cover',   ctrl.imageValidators, ctrl.setCover);

module.exports = router;
