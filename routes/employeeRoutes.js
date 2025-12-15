import express from 'express';
import { deleteUser, getAllDeletedUsers,addIsDeletedField, getAllDepartments, getAllDesignations, getAllUsers, getDashboard, getUserById, saveUserTimeZone, updateProfileBySelf, updateUser, updateUserPassword, updateUserRole, getAllUsersWithoutPagination } from '../controllers/userController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';
import { getSearchUsers } from '../controllers/searchController.js';
const employeeRouter = express.Router();

// employeeRouter.get('/dashboard', authenticate, getDashboard);
employeeRouter.use(authenticate);
employeeRouter.patch('/update_profile_by_self', authorizeRoles('admin', 'hr','employee'), updateProfileBySelf);


employeeRouter.get('/deleted', authorizeRoles('admin', 'hr'), getAllDeletedUsers);
employeeRouter.get('/list', authorizeRoles('admin', 'hr'), getAllUsersWithoutPagination);
employeeRouter.get('/', authorizeRoles('admin', 'hr'), getAllUsers);
employeeRouter.get('/designation', getAllDesignations);
employeeRouter.get('/department', getAllDepartments);
employeeRouter.get('/search', getSearchUsers);
// employeeRouter.get('/add_isDeleted', addIsDeletedField);

employeeRouter.get('/:id', authorizeRoles('admin', 'hr', 'employee'), getUserById);
employeeRouter.put('/:id', authorizeRoles('admin', 'hr'), updateUser);
employeeRouter.patch('/:id', authorizeRoles( "superAdmin"), deleteUser);

employeeRouter.put('/reset_password/:id', authorizeRoles('superAdmin'), updateUserPassword);
employeeRouter.put('/update_role/:id', authorizeRoles('superAdmin'), updateUserRole);
employeeRouter.post('/timezone', authorizeRoles('admin', 'hr', 'employee'), saveUserTimeZone);

export default employeeRouter;

 


