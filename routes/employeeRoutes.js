import express from 'express';
import { deleteUser, getAllUsers, getDashboard, getUserById, saveUserTimeZone, updateUser, updateUserPassword } from '../controllers/userController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';
const employeeRouter = express.Router();

employeeRouter.get('/dashboard', authenticate, getDashboard);

employeeRouter.use(authenticate);
employeeRouter.get('/', authorizeRoles('admin', 'hr'), getAllUsers);
employeeRouter.get('/:id', authorizeRoles('admin', 'hr', 'employee'), getUserById);
employeeRouter.put('/:id', authorizeRoles('admin', 'hr'), updateUser);
employeeRouter.delete('/:id', authorizeRoles('admin', 'hr'), deleteUser);

employeeRouter.put('/reset_password/:id', authorizeRoles('admin'), updateUserPassword);
employeeRouter.post('/timezone', authorizeRoles('admin', 'hr', 'employee'), saveUserTimeZone);

export default employeeRouter;




