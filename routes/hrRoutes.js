import express from 'express';
import { deleteUser, getAllUsers, getDashboard, getUserById, updateUser } from '../controllers/userController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';
const hrRouter = express.Router();

hrRouter.get('/dashboard', authenticate, getDashboard);

hrRouter.use(authenticate);
hrRouter.get('/', authorizeRoles('admin'),getAllUsers);
hrRouter.get('/:id', authorizeRoles('admin'), getUserById);
hrRouter.put('/:id', authorizeRoles('admin'), updateUser);
hrRouter.delete('/:id', authorizeRoles('superAdmin'), deleteUser);


export default hrRouter;
